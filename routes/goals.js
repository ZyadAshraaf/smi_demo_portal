const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const goalsPath = path.join(__dirname, '../data/goals.json');
const read  = () => JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
const write = d  => fs.writeFileSync(goalsPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

router.get('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  let goals   = read();

  if (user.role === 'employee') {
    goals = goals.filter(g => g.ownerId === user.id);
  }

  res.json({ success: true, goals });
});

router.post('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  const goals = read();

  const goal = {
    id:          'G' + uuidv4().split('-')[0].toUpperCase(),
    title:       req.body.title,
    description: req.body.description || '',
    ownerId:     req.body.ownerId || user.id,
    category:    req.body.category || 'General',
    startDate:   req.body.startDate,
    dueDate:     req.body.dueDate,
    progress:    0,
    status:      'on-track',
    keyResults:  req.body.keyResults || [],
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString()
  };

  goals.push(goal);
  write(goals);
  res.json({ success: true, goal });
});

router.put('/:id', requireAuth, (req, res) => {
  const goals = read();
  const idx   = goals.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Goal not found' });

  const g = goals[idx];
  ['title', 'description', 'progress', 'status', 'keyResults'].forEach(f => {
    if (req.body[f] !== undefined) g[f] = req.body[f];
  });
  g.updatedAt = new Date().toISOString();

  write(goals);
  res.json({ success: true, goal: g });
});

module.exports = router;
