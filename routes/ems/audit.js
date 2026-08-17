const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const auditPath = path.join(__dirname, '../../data/ems-audit.json');
const readAudit = () => JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET — list audit entries with filters
router.get('/', requireAuth, (req, res) => {
  let entries = readAudit();
  const { entityType, entityId, userId, action, from, to } = req.query;

  if (entityType) entries = entries.filter(e => e.entityType === entityType);
  if (entityId) entries = entries.filter(e => e.entityId === entityId);
  if (userId) entries = entries.filter(e => e.userId === userId);
  if (action) entries = entries.filter(e => e.action === action);
  if (from) entries = entries.filter(e => e.timestamp >= from);
  if (to) entries = entries.filter(e => e.timestamp <= to);

  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ success: true, entries });
});

module.exports = router;
