const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const usersPath = path.join(__dirname, '../data/users.json');
const read = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/directory
router.get('/', requireAuth, (req, res) => {
  const users   = read();
  const q       = (req.query.q || '').toLowerCase();
  const dept    = (req.query.department || '').toLowerCase();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  let result = users.map(u => ({
    id:         u.id,
    name:       u.name,
    email:      u.email,
    role:       u.role,
    department: u.department,
    jobTitle:   u.jobTitle,
    phone:      u.phone,
    location:   u.location,
    joinDate:   u.joinDate,
    avatar:     u.avatar,
    managerName: userMap[u.managerId] || null
  }));

  if (q)    result = result.filter(u => u.name.toLowerCase().includes(q) || u.jobTitle.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (dept) result = result.filter(u => u.department.toLowerCase().includes(dept));

  res.json({ success: true, users: result });
});

// GET /api/directory/departments
router.get('/departments', requireAuth, (req, res) => {
  const users = read();
  const depts = [...new Set(users.map(u => u.department))].sort();
  res.json({ success: true, departments: depts });
});

module.exports = router;
