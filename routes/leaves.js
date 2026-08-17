const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { notifyLeaveRequest, notifyLeaveDecision } = require('../utils/teamsNotify');

const leavesPath = path.join(__dirname, '../data/leaves.json');
const tasksPath  = path.join(__dirname, '../data/tasks.json');
const usersPath  = path.join(__dirname, '../data/users.json');

const readLeaves = () => JSON.parse(fs.readFileSync(leavesPath, 'utf8'));
const readTasks  = () => JSON.parse(fs.readFileSync(tasksPath,  'utf8'));
const readUsers  = () => JSON.parse(fs.readFileSync(usersPath,  'utf8'));
const writeLeaves = d => fs.writeFileSync(leavesPath, JSON.stringify(d, null, 2));
const writeTasks  = d => fs.writeFileSync(tasksPath,  JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/leaves/:id
router.get('/:id', requireAuth, (req, res) => {
  const users  = readUsers();
  const uMap   = {};
  users.forEach(u => uMap[u.id] = u.name);
  const leave  = readLeaves().find(l => l.id === req.params.id);
  if (!leave) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, leave: { ...leave, userName: uMap[leave.userId] || 'Unknown', reviewerName: uMap[leave.reviewedBy] || null } });
});

// GET /api/leaves
router.get('/', requireAuth, (req, res) => {
  const user   = req.session.user;
  let leaves   = readLeaves();
  const users  = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  // Managers and HR see all; employees see own
  if (user.role === 'employee') {
    leaves = leaves.filter(l => l.userId === user.id);
  }

  leaves = leaves.map(l => ({
    ...l,
    userName:     userMap[l.userId]     || 'Unknown',
    reviewerName: userMap[l.reviewedBy] || null
  }));

  res.json({ success: true, leaves });
});

// POST /api/leaves — submit a new leave request
router.post('/', requireAuth, (req, res) => {
  const user   = req.session.user;
  const leaves = readLeaves();
  const tasks  = readTasks();
  const users  = readUsers();

  // Find manager
  const employee = users.find(u => u.id === user.id);
  const managerId = employee ? employee.managerId : null;

  const leaveId = 'L' + uuidv4().split('-')[0].toUpperCase();

  // Create leave record
  const leave = {
    id:          leaveId,
    userId:      user.id,
    type:        req.body.type,
    startDate:   req.body.startDate,
    endDate:     req.body.endDate,
    days:        req.body.days,
    reason:       req.body.reason || '',
    customFields: req.body.customFields || {},
    status:       'pending',
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
      title:        `Approve Leave Request — ${user.name}`,
      description:  `${user.name} has requested ${req.body.type} leave for ${req.body.days} day(s) (${req.body.startDate} to ${req.body.endDate}). Reason: ${req.body.reason}`,
      sourceSystem: 'HR',
      type:         'approval',
      priority:     'medium',
      status:       'pending',
      assignedTo:   managerId,
      createdBy:    user.id,
      dueDate:      req.body.startDate,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { leaveId, requestDetails: { userName: user.name, type: req.body.type, startDate: req.body.startDate, endDate: req.body.endDate, days: req.body.days, reason: req.body.reason || '', customFields: req.body.customFields || {}, submittedAt: new Date().toISOString() } },
      history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Leave request submitted' }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    };

    leave.taskId = task.id;
    tasks.push(task);
    writeTasks(tasks);
  }

  leaves.push(leave);
  writeLeaves(leaves);

  // Notify manager on Microsoft Teams (activity feed notification)
  const manager = managerId ? users.find(u => u.id === managerId) : null;
  notifyLeaveRequest({
    managerEmail: manager ? manager.email : null,
    employeeName: user.name,
    leaveType:    req.body.type,
    days:         req.body.days,
    startDate:    req.body.startDate,
    endDate:      req.body.endDate,
    reason:       req.body.reason || ''
  });

  res.json({ success: true, leave });
});

// PUT /api/leaves/:id — approve or reject
router.put('/:id', requireAuth, (req, res) => {
  const user   = req.session.user;
  const leaves = readLeaves();
  const tasks  = readTasks();

  const lIdx = leaves.findIndex(l => l.id === req.params.id);
  if (lIdx === -1) return res.status(404).json({ success: false, message: 'Leave not found' });

  const leave    = leaves[lIdx];
  leave.status   = req.body.status; // 'approved' | 'rejected'
  leave.reviewedBy  = user.id;
  leave.reviewedAt  = new Date().toISOString();
  leave.reviewNote  = req.body.note || '';

  // Update related task
  if (leave.taskId) {
    const tIdx = tasks.findIndex(t => t.id === leave.taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = leave.status; // 'approved' or 'rejected'
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({
        action: leave.status === 'approved' ? 'approved' : 'rejected',
        by:     user.id,
        at:     new Date().toISOString(),
        note:   req.body.note || `Leave request ${leave.status}`
      });
      writeTasks(tasks);
    }
  }

  writeLeaves(leaves);

  // Notify employee on Microsoft Teams about the decision
  const users    = readUsers();
  const empUser  = users.find(u => u.id === leave.userId);
  notifyLeaveDecision({
    employeeEmail: empUser ? empUser.email : null,
    employeeName:  empUser ? empUser.name : 'Unknown',
    leaveType:     leave.type,
    days:          leave.days,
    startDate:     leave.startDate,
    endDate:       leave.endDate,
    status:        leave.status,
    reviewerName:  user.name,
    reviewNote:    req.body.note || ''
  });

  res.json({ success: true, leave });
});

module.exports = router;
