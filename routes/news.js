const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const newsPath  = path.join(__dirname, '../data/news.json');
const notifsPath = path.join(__dirname, '../data/notifications.json');

const read = () => JSON.parse(fs.readFileSync(newsPath, 'utf8'));
const readNotifs = () => JSON.parse(fs.readFileSync(notifsPath, 'utf8'));
const writeNotifs = d => fs.writeFileSync(notifsPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/news
router.get('/', requireAuth, (req, res) => {
  const news = read().sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  res.json({ success: true, news });
});

// GET /api/news/notifications
router.get('/notifications', requireAuth, (req, res) => {
  const user  = req.session.user;
  const notifs = readNotifs()
    .filter(n => n.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, notifications: notifs, unreadCount: notifs.filter(n => !n.read).length });
});

// PUT /api/news/notifications/:id/read
router.put('/notifications/:id/read', requireAuth, (req, res) => {
  const notifs = readNotifs();
  const idx    = notifs.findIndex(n => n.id === req.params.id);
  if (idx !== -1) notifs[idx].read = true;
  writeNotifs(notifs);
  res.json({ success: true });
});

module.exports = router;
