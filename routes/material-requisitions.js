const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const mrqPath      = path.join(__dirname, '../data/material-requisitions.json');
const tasksPath    = path.join(__dirname, '../data/tasks.json');
const usersPath    = path.join(__dirname, '../data/users.json');
const materialsPath= path.join(__dirname, '../data/materials.json');

const readMRQs      = () => JSON.parse(fs.readFileSync(mrqPath,       'utf8'));
const readTasks     = () => JSON.parse(fs.readFileSync(tasksPath,      'utf8'));
const readUsers     = () => JSON.parse(fs.readFileSync(usersPath,      'utf8'));
const readMaterials = () => JSON.parse(fs.readFileSync(materialsPath,  'utf8'));
const writeMRQs     = d  => fs.writeFileSync(mrqPath,    JSON.stringify(d, null, 2));
const writeTasks    = d  => fs.writeFileSync(tasksPath,  JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/material-requisitions/materials
router.get('/materials', requireAuth, (req, res) => {
  const { search, category } = req.query;
  let mats = readMaterials();
  if (search) {
    const q = search.toLowerCase();
    mats = mats.filter(m => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q));
  }
  if (category && category !== 'all') {
    mats = mats.filter(m => m.category === category);
  }
  res.json({ success: true, materials: mats });
});

// GET /api/material-requisitions
router.get('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  let   mrqs  = readMRQs();
  const users = readUsers();
  const uMap  = {};
  users.forEach(u => uMap[u.id] = u.name);

  if (user.role === 'employee') {
    mrqs = mrqs.filter(m => m.userId === user.id);
  }

  mrqs = mrqs.map(m => ({
    ...m,
    userName:     uMap[m.userId]     || 'Unknown',
    reviewerName: uMap[m.reviewedBy] || null
  }));

  res.json({ success: true, mrqs });
});

// GET /api/material-requisitions/:id
router.get('/:id', requireAuth, (req, res) => {
  const user  = req.session.user;
  const mrqs  = readMRQs();
  const users = readUsers();
  const uMap  = {};
  users.forEach(u => uMap[u.id] = u.name);

  const mrq = mrqs.find(m => m.id === req.params.id);
  if (!mrq) return res.status(404).json({ success: false, message: 'Requisition not found' });
  if (user.role === 'employee' && mrq.userId !== user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  res.json({ success: true, mrq: { ...mrq, userName: uMap[mrq.userId] || 'Unknown', reviewerName: uMap[mrq.reviewedBy] || null } });
});

// POST /api/material-requisitions
router.post('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  const mrqs  = readMRQs();
  const tasks = readTasks();
  const users = readUsers();

  const employee  = users.find(u => u.id === user.id);
  const managerId = employee ? employee.managerId : null;

  const mrqNumber = `MR-${new Date().getFullYear()}-${String(mrqs.length + 1).padStart(4, '0')}`;
  const mrqId     = 'MR' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();

  const lineItems   = req.body.lineItems || [];
  const totalItems  = lineItems.reduce((s, li) => s + (Number(li.qtyRequested) || 0), 0);

  const mrq = {
    id:               mrqId,
    mrqNumber,
    userId:           user.id,
    department:       req.body.department       || '',
    deliveryLocation: req.body.deliveryLocation || '',
    requiredBy:       req.body.requiredBy       || '',
    priority:         req.body.priority         || 'normal',
    projectCode:      req.body.projectCode      || '',
    lineItems,
    justification:    req.body.justification    || '',
    status:           'pending',
    taskId:           null,
    submittedAt:      new Date().toISOString(),
    reviewedBy:       null,
    reviewedAt:       null,
    reviewNote:       ''
  };

  if (managerId) {
    const task = {
      id:           'T' + uuidv4().split('-')[0].toUpperCase(),
      title:        `Approve Material Requisition — ${mrqNumber}`,
      description:  `${user.name} (${mrq.department}) requested ${lineItems.length} material line(s) (${totalItems} total units) for ${mrq.deliveryLocation}. Required by: ${mrq.requiredBy}.`,
      sourceSystem: 'Warehouse',
      type:         'approval',
      priority:     mrq.priority === 'urgent' ? 'high' : 'medium',
      status:       'pending',
      assignedTo:   managerId,
      createdBy:    user.id,
      dueDate:      mrq.requiredBy,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { mrqId },
      history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Material Requisition submitted for approval' }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    };
    mrq.taskId = task.id;
    tasks.push(task);
    writeTasks(tasks);
  }

  mrqs.push(mrq);
  writeMRQs(mrqs);
  res.json({ success: true, mrq });
});

// PUT /api/material-requisitions/:id/approve
router.put('/:id/approve', requireAuth, (req, res) => {
  const user  = req.session.user;
  const mrqs  = readMRQs();
  const tasks = readTasks();

  const idx = mrqs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Requisition not found' });

  mrqs[idx].status     = 'approved';
  mrqs[idx].reviewedBy = user.id;
  mrqs[idx].reviewedAt = new Date().toISOString();
  mrqs[idx].reviewNote = req.body.note || '';

  if (mrqs[idx].taskId) {
    const tIdx = tasks.findIndex(t => t.id === mrqs[idx].taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = 'approved';
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({ action: 'approved', by: user.id, at: new Date().toISOString(), note: req.body.note || 'Requisition approved' });
      writeTasks(tasks);
    }
  }

  writeMRQs(mrqs);
  res.json({ success: true, mrq: mrqs[idx] });
});

// PUT /api/material-requisitions/:id/reject
router.put('/:id/reject', requireAuth, (req, res) => {
  const user  = req.session.user;
  const mrqs  = readMRQs();
  const tasks = readTasks();

  const idx = mrqs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Requisition not found' });

  mrqs[idx].status     = 'rejected';
  mrqs[idx].reviewedBy = user.id;
  mrqs[idx].reviewedAt = new Date().toISOString();
  mrqs[idx].reviewNote = req.body.note || '';

  if (mrqs[idx].taskId) {
    const tIdx = tasks.findIndex(t => t.id === mrqs[idx].taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = 'rejected';
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({ action: 'rejected', by: user.id, at: new Date().toISOString(), note: req.body.note || 'Requisition rejected' });
      writeTasks(tasks);
    }
  }

  writeMRQs(mrqs);
  res.json({ success: true, mrq: mrqs[idx] });
});

module.exports = router;
