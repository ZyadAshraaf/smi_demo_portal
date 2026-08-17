const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const poPath      = path.join(__dirname, '../data/purchase-orders.json');
const tasksPath   = path.join(__dirname, '../data/tasks.json');
const usersPath   = path.join(__dirname, '../data/users.json');
const vendorsPath = path.join(__dirname, '../data/vendors.json');

const readPOs     = () => JSON.parse(fs.readFileSync(poPath,      'utf8'));
const readTasks   = () => JSON.parse(fs.readFileSync(tasksPath,   'utf8'));
const readUsers   = () => JSON.parse(fs.readFileSync(usersPath,   'utf8'));
const readVendors = () => JSON.parse(fs.readFileSync(vendorsPath, 'utf8'));
const writePOs    = d  => fs.writeFileSync(poPath,    JSON.stringify(d, null, 2));
const writeTasks  = d  => fs.writeFileSync(tasksPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/purchase-orders/vendors
router.get('/vendors', requireAuth, (req, res) => {
  res.json({ success: true, vendors: readVendors() });
});

// GET /api/purchase-orders
router.get('/', requireAuth, (req, res) => {
  const user   = req.session.user;
  let   pos    = readPOs();
  const users  = readUsers();
  const uMap   = {};
  users.forEach(u => uMap[u.id] = u.name);

  if (user.role === 'employee') {
    pos = pos.filter(p => p.userId === user.id);
  }

  pos = pos.map(p => ({
    ...p,
    userName:     uMap[p.userId]     || 'Unknown',
    reviewerName: uMap[p.reviewedBy] || null
  }));

  res.json({ success: true, pos });
});

// GET /api/purchase-orders/:id
router.get('/:id', requireAuth, (req, res) => {
  const user  = req.session.user;
  const pos   = readPOs();
  const users = readUsers();
  const uMap  = {};
  users.forEach(u => uMap[u.id] = u.name);

  const po = pos.find(p => p.id === req.params.id);
  if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
  if (user.role === 'employee' && po.userId !== user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  res.json({ success: true, po: { ...po, userName: uMap[po.userId] || 'Unknown', reviewerName: uMap[po.reviewedBy] || null } });
});

// POST /api/purchase-orders
router.post('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  const pos   = readPOs();
  const tasks = readTasks();
  const users = readUsers();

  const employee  = users.find(u => u.id === user.id);
  const managerId = employee ? employee.managerId : null;

  const poNumber = `PO-${new Date().getFullYear()}-${String(pos.length + 1).padStart(4, '0')}`;
  const poId     = 'PO' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();

  const grandTotal = Number(req.body.grandTotal) || 0;

  const po = {
    id:               poId,
    poNumber,
    userId:           user.id,
    vendorId:         req.body.vendorId         || '',
    vendorName:       req.body.vendorName       || '',
    deliveryLocation: req.body.deliveryLocation || '',
    requiredBy:       req.body.requiredBy       || '',
    costCenter:       req.body.costCenter       || '',
    currency:         req.body.currency         || 'AED',
    paymentTerms:     req.body.paymentTerms     || 'Net 30',
    lineItems:        req.body.lineItems        || [],
    subtotal:         Number(req.body.subtotal) || 0,
    taxPct:           Number(req.body.taxPct)   || 15,
    taxAmount:        Number(req.body.taxAmount)|| 0,
    grandTotal,
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
      title:        `Approve Purchase Order — ${poNumber}`,
      description:  `${user.name} submitted ${poNumber} to ${po.vendorName} for ${po.currency} ${grandTotal.toFixed(2)}. Cost Center: ${po.costCenter}.`,
      sourceSystem: 'Procurement',
      type:         'approval',
      priority:     'medium',
      status:       'pending',
      assignedTo:   managerId,
      createdBy:    user.id,
      dueDate:      po.requiredBy,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { poId },
      history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Purchase Order submitted for approval' }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    };
    po.taskId = task.id;
    tasks.push(task);
    writeTasks(tasks);
  }

  pos.push(po);
  writePOs(pos);
  res.json({ success: true, po });
});

// PUT /api/purchase-orders/:id/approve
router.put('/:id/approve', requireAuth, (req, res) => {
  const user  = req.session.user;
  const pos   = readPOs();
  const tasks = readTasks();

  const idx = pos.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'PO not found' });

  pos[idx].status     = 'approved';
  pos[idx].reviewedBy = user.id;
  pos[idx].reviewedAt = new Date().toISOString();
  pos[idx].reviewNote = req.body.note || '';

  if (pos[idx].taskId) {
    const tIdx = tasks.findIndex(t => t.id === pos[idx].taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = 'approved';
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({ action: 'approved', by: user.id, at: new Date().toISOString(), note: req.body.note || 'PO approved' });
      writeTasks(tasks);
    }
  }

  writePOs(pos);
  res.json({ success: true, po: pos[idx] });
});

// PUT /api/purchase-orders/:id/reject
router.put('/:id/reject', requireAuth, (req, res) => {
  const user  = req.session.user;
  const pos   = readPOs();
  const tasks = readTasks();

  const idx = pos.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'PO not found' });

  pos[idx].status     = 'rejected';
  pos[idx].reviewedBy = user.id;
  pos[idx].reviewedAt = new Date().toISOString();
  pos[idx].reviewNote = req.body.note || '';

  if (pos[idx].taskId) {
    const tIdx = tasks.findIndex(t => t.id === pos[idx].taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = 'rejected';
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({ action: 'rejected', by: user.id, at: new Date().toISOString(), note: req.body.note || 'PO rejected' });
      writeTasks(tasks);
    }
  }

  writePOs(pos);
  res.json({ success: true, po: pos[idx] });
});

module.exports = router;
