const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const usersPath = path.join(__dirname, '../data/users.json');
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readUsers();
  const user  = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const { password: _, ...safeUser } = user;
  req.session.user = safeUser;

  req.session.save(err => {
    if (err) return res.status(500).json({ success: false, message: 'Session error' });
    res.json({ success: true, user: safeUser });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/logout (browser link fallback)
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/unifiedsmi/login');
  });
});

module.exports = router;
