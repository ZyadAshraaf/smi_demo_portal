const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const tasksPath = path.join(__dirname, '../data/tasks.json');
const usersPath = path.join(__dirname, '../data/users.json');

const read  = () => JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const write = (data) => fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/tasks — get tasks for current user (or all for admin/hr)
router.get('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  let tasks   = read();
  const users = readUsers();

  // Admins and HR see all tasks; others see only their own
  if (user.role !== 'admin' && user.role !== 'hr') {
    tasks = tasks.filter(t => t.assignedTo === user.id);
  }

  // Enrich with user names
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  tasks = tasks.map(t => ({
    ...t,
    assignedToName: userMap[t.assignedTo] || 'Unknown',
    createdByName:  userMap[t.createdBy]  || 'Unknown'
  }));

  res.json({ success: true, tasks });
});

// GET /api/tasks/:id
router.get('/:id', requireAuth, (req, res) => {
  const tasks = read();
  const task  = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  res.json({
    success: true,
    task: {
      ...task,
      assignedToName: userMap[task.assignedTo] || 'Unknown',
      createdByName:  userMap[task.createdBy]  || 'Unknown'
    }
  });
});

// POST /api/tasks — create new task
router.post('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  const tasks = read();

  const newTask = {
    id:           'T' + uuidv4().split('-')[0].toUpperCase(),
    title:        req.body.title,
    description:  req.body.description || '',
    sourceSystem: req.body.sourceSystem || 'Manual',
    type:         req.body.type || 'task',
    priority:     req.body.priority || 'medium',
    status:       'pending',
    assignedTo:   req.body.assignedTo || user.id,
    createdBy:    user.id,
    dueDate:      req.body.dueDate || null,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    metadata:     {},
    history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: `Task created by ${user.name}` }],
    comments:     [],
    escalated:    false,
    delegatedFrom: null
  };

  tasks.push(newTask);
  write(tasks);
  res.json({ success: true, task: newTask });
});

// PUT /api/tasks/:id — update task (status, priority, etc.)
router.put('/:id', requireAuth, (req, res) => {
  const user  = req.session.user;
  const tasks = read();
  const idx   = tasks.findIndex(t => t.id === req.params.id);

  if (idx === -1) return res.status(404).json({ success: false, message: 'Task not found' });

  const task    = tasks[idx];
  const allowed = ['status', 'priority', 'dueDate', 'description'];

  allowed.forEach(field => {
    if (req.body[field] !== undefined) task[field] = req.body[field];
  });

  task.updatedAt = new Date().toISOString();
  task.history.push({
    action: 'updated',
    by:     user.id,
    at:     new Date().toISOString(),
    note:   req.body.note || 'Task updated'
  });

  write(tasks);
  res.json({ success: true, task });
});

// POST /api/tasks/:id/comment
router.post('/:id/comment', requireAuth, (req, res) => {
  const user  = req.session.user;
  const tasks = read();
  const idx   = tasks.findIndex(t => t.id === req.params.id);

  if (idx === -1) return res.status(404).json({ success: false, message: 'Task not found' });

  const comment = {
    by:   user.id,
    name: user.name,
    at:   new Date().toISOString(),
    text: req.body.text
  };

  tasks[idx].comments.push(comment);
  tasks[idx].updatedAt = new Date().toISOString();
  write(tasks);
  res.json({ success: true, comment });
});

// POST /api/tasks/:id/delegate
router.post('/:id/delegate', requireAuth, (req, res) => {
  const user    = req.session.user;
  const tasks   = read();
  const idx     = tasks.findIndex(t => t.id === req.params.id);

  if (idx === -1) return res.status(404).json({ success: false, message: 'Task not found' });

  const task = tasks[idx];
  task.delegatedFrom = task.assignedTo;
  task.assignedTo    = req.body.assignTo;
  task.updatedAt     = new Date().toISOString();
  task.history.push({
    action: 'delegated',
    by:     user.id,
    at:     new Date().toISOString(),
    note:   `Delegated to user ${req.body.assignTo}. Reason: ${req.body.reason || 'Not specified'}`
  });

  write(tasks);
  res.json({ success: true, task });
});

// POST /api/tasks/:id/reassign
router.post('/:id/reassign', requireAuth, (req, res) => {
  const user  = req.session.user;
  const tasks = read();
  const idx   = tasks.findIndex(t => t.id === req.params.id);

  if (idx === -1) return res.status(404).json({ success: false, message: 'Task not found' });

  const task = tasks[idx];
  task.assignedTo = req.body.assignTo;
  task.updatedAt  = new Date().toISOString();
  task.history.push({
    action: 'reassigned',
    by:     user.id,
    at:     new Date().toISOString(),
    note:   `Permanently reassigned to user ${req.body.assignTo}. Reason: ${req.body.reason || 'Not specified'}`
  });

  write(tasks);
  res.json({ success: true, task });
});

// POST /api/tasks/:id/escalate
router.post('/:id/escalate', requireAuth, (req, res) => {
  const user  = req.session.user;
  const tasks = read();
  const idx   = tasks.findIndex(t => t.id === req.params.id);

  if (idx === -1) return res.status(404).json({ success: false, message: 'Task not found' });

  const task   = tasks[idx];
  task.escalated = true;
  task.status    = 'escalated';
  task.updatedAt = new Date().toISOString();
  task.history.push({
    action: 'escalated',
    by:     user.id,
    at:     new Date().toISOString(),
    note:   `Escalated. Reason: ${req.body.reason || 'Not specified'}`
  });

  write(tasks);
  res.json({ success: true, task });
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, (req, res) => {
  let tasks = read();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Task not found' });

  tasks.splice(idx, 1);
  write(tasks);
  res.json({ success: true });
});

module.exports = router;
