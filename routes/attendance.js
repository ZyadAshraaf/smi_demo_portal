const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const attendancePath = path.join(__dirname, '../data/attendance.json');
const read  = () => JSON.parse(fs.readFileSync(attendancePath, 'utf8'));
const write = d  => fs.writeFileSync(attendancePath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/attendance — current user's attendance records
router.get('/', requireAuth, (req, res) => {
  const user   = req.session.user;
  const all    = read();
  const records = all[user.id] || [];

  const summary = {
    present: records.filter(r => r.status === 'present').length,
    late:    records.filter(r => r.status === 'late').length,
    absent:  records.filter(r => r.status === 'absent').length,
    leave:   records.filter(r => r.status === 'leave').length
  };

  res.json({ success: true, records, summary });
});

// GET /api/attendance/today
router.get('/today', requireAuth, (req, res) => {
  const user    = req.session.user;
  const all     = read();
  const records = all[user.id] || [];
  const today   = new Date().toISOString().split('T')[0];
  const record  = records.find(r => r.date === today) || null;

  res.json({ success: true, record });
});

// GET /api/attendance/team — managers see their team
router.get('/team', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user.role !== 'manager' && user.role !== 'admin' && user.role !== 'hr') {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const all    = read();
  const today  = new Date().toISOString().split('T')[0];
  const result = {};

  Object.keys(all).forEach(uid => {
    const todayRecord = all[uid].find(r => r.date === today);
    result[uid] = todayRecord || { date: today, status: 'absent' };
  });

  res.json({ success: true, team: result });
});

module.exports = router;
