const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const wfhPath   = path.join(__dirname, '../data/wfh.json');
const tasksPath = path.join(__dirname, '../data/tasks.json');
const usersPath = path.join(__dirname, '../data/users.json');

const readWfh   = () => JSON.parse(fs.readFileSync(wfhPath,   'utf8'));
const readTasks = () => JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const writeWfh  = d  => fs.writeFileSync(wfhPath,   JSON.stringify(d, null, 2));
const writeTasks = d => fs.writeFileSync(tasksPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/wfh/:id
router.get('/:id', requireAuth, (req, res) => {
  const users   = readUsers();
  const uMap    = {};
  users.forEach(u => uMap[u.id] = u.name);
  const record  = readWfh().find(w => w.id === req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, wfh: { ...record, userName: uMap[record.userId] || 'Unknown', reviewerName: uMap[record.reviewedBy] || null } });
});

// GET /api/wfh
router.get('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  let records   = readWfh();
  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  // Employees see only their own; managers/hr/admin see all
  if (user.role === 'employee') {
    records = records.filter(w => w.userId === user.id);
  }

  records = records.map(w => ({
    ...w,
    userName:     userMap[w.userId]     || 'Unknown',
    reviewerName: userMap[w.reviewedBy] || null
  }));

  res.json({ success: true, wfh: records });
});

// POST /api/wfh — submit a new WFH request
router.post('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  const records = readWfh();
  const tasks   = readTasks();
  const users   = readUsers();

  const employee   = users.find(u => u.id === user.id);
  const managerId  = employee ? employee.managerId : null;

  const wfhId = 'W' + uuidv4().split('-')[0].toUpperCase();

  const wfh = {
    id:          wfhId,
    userId:      user.id,
    startDate:   req.body.startDate,
    endDate:     req.body.endDate,
    days:        req.body.days,
    reason:      req.body.reason || '',
    status:      'pending',
    taskId:      null,
    submittedAt: new Date().toISOString(),
    reviewedBy:  null,
    reviewedAt:  null,
    reviewNote:  ''
  };

  // Create approval task for manager
  if (managerId) {
    const task = {
      id:           'T' + uuidv4().split('-')[0].toUpperCase(),
      title:        `Approve WFH Request — ${user.name}`,
      description:  `${user.name} has requested to work from home for ${req.body.days} day(s) (${req.body.startDate} to ${req.body.endDate}). Reason: ${req.body.reason || 'Not provided'}`,
      sourceSystem: 'HR',
      type:         'approval',
      priority:     'medium',
      status:       'pending',
      assignedTo:   managerId,
      createdBy:    user.id,
      dueDate:      req.body.startDate,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { wfhId, requestDetails: { userName: user.name, startDate: req.body.startDate, endDate: req.body.endDate, days: req.body.days, reason: req.body.reason || '', submittedAt: new Date().toISOString() } },
      history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'WFH request submitted' }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    };

    wfh.taskId = task.id;
    tasks.push(task);
    writeTasks(tasks);
  }

  records.push(wfh);
  writeWfh(records);

  res.json({ success: true, wfh });
});

// PUT /api/wfh/:id — approve or reject
router.put('/:id', requireAuth, (req, res) => {
  const user    = req.session.user;
  const records = readWfh();
  const tasks   = readTasks();

  const idx = records.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'WFH request not found' });

  const wfh       = records[idx];
  wfh.status      = req.body.status; // 'approved' | 'rejected'
  wfh.reviewedBy  = user.id;
  wfh.reviewedAt  = new Date().toISOString();
  wfh.reviewNote  = req.body.note || '';

  // Update related task
  if (wfh.taskId) {
    const tIdx = tasks.findIndex(t => t.id === wfh.taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = wfh.status; // 'approved' or 'rejected'
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({
        action: wfh.status === 'approved' ? 'approved' : 'rejected',
        by:     user.id,
        at:     new Date().toISOString(),
        note:   req.body.note || `WFH request ${wfh.status}`
      });
      writeTasks(tasks);
    }
  }

  writeWfh(records);
  res.json({ success: true, wfh });
});

module.exports = router;
