const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', file), 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/analytics/summary
router.get('/summary', requireAuth, (req, res) => {
  const tasks      = read('tasks.json');
  const leaves     = read('leaves.json');
  const helpdesk   = read('helpdesk.json');
  const attendance = read('attendance.json');
  const user       = req.session.user;

  const myTasks    = (user.role === 'admin' || user.role === 'hr') ? tasks : tasks.filter(t => t.assignedTo === user.id);
  const myLeaves   = leaves.filter(l => l.userId === user.id);
  const myAttend   = attendance[user.id] || [];

  // Only count current month
  const now          = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth    = myAttend.filter(d => d.date.startsWith(currentMonth));

  const presentDays = thisMonth.filter(d => d.status === 'present').length;
  const lateDays    = thisMonth.filter(d => d.status === 'late').length;
  const leaveDays   = thisMonth.filter(d => d.status === 'leave').length;

  const leaveBalance = {
    annual: 21 - myLeaves.filter(l => l.type === 'annual' && l.status === 'approved').reduce((s, l) => s + l.days, 0),
    sick:   30
  };

  res.json({
    success: true,
    summary: {
      totalTasks:     myTasks.length,
      pendingTasks:   myTasks.filter(t => t.status === 'pending').length,
      completedTasks: myTasks.filter(t => t.status === 'completed').length,
      escalatedTasks: myTasks.filter(t => t.escalated).length,
      openTickets:    helpdesk.filter(h => h.submittedBy === user.id && h.status !== 'resolved' && h.status !== 'closed').length,
      leaveBalance,
      attendance: { presentDays, lateDays, leaveDays }
    }
  });
});

// GET /api/analytics/tasks-by-system
router.get('/tasks-by-system', requireAuth, (req, res) => {
  const tasks = read('tasks.json');
  const user  = req.session.user;
  const mine  = (user.role === 'admin' || user.role === 'hr') ? tasks : tasks.filter(t => t.assignedTo === user.id);

  const bySystem = {};
  mine.forEach(t => {
    bySystem[t.sourceSystem] = (bySystem[t.sourceSystem] || 0) + 1;
  });

  res.json({ success: true, data: bySystem });
});

// GET /api/analytics/tasks-by-status
router.get('/tasks-by-status', requireAuth, (req, res) => {
  const tasks = read('tasks.json');
  const user  = req.session.user;
  const mine  = (user.role === 'admin' || user.role === 'hr') ? tasks : tasks.filter(t => t.assignedTo === user.id);

  const byStatus = {};
  mine.forEach(t => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  });

  res.json({ success: true, data: byStatus });
});

// GET /api/analytics/tasks-by-priority
router.get('/tasks-by-priority', requireAuth, (req, res) => {
  const tasks = read('tasks.json');
  const user  = req.session.user;
  const mine  = (user.role === 'admin' || user.role === 'hr') ? tasks : tasks.filter(t => t.assignedTo === user.id);

  const result = { critical: 0, high: 0, medium: 0, low: 0 };
  mine.forEach(t => { if (result[t.priority] !== undefined) result[t.priority]++; });

  res.json({ success: true, data: result });
});

// GET /api/analytics/leave-summary
router.get('/leave-summary', requireAuth, (req, res) => {
  const user   = req.session.user;
  const allLeaves = read('leaves.json');
  const leaves = allLeaves.filter(l => l.userId === user.id);

  const byType   = {};
  const byStatus = {};
  leaves.forEach(l => {
    byType[l.type]     = (byType[l.type]     || 0) + l.days;
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  });

  res.json({ success: true, byType, byStatus });
});

module.exports = router;
