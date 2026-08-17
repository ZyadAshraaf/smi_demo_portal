const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const sigPath = path.join(__dirname, '../../data/ems-signatures.json');

const readSigs  = () => JSON.parse(fs.readFileSync(sigPath, 'utf8'));
const writeSigs = d => fs.writeFileSync(sigPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET — list current user's saved signatures
router.get('/', requireAuth, (req, res) => {
  const sigs = readSigs().filter(s => s.userId === req.session.user.id);
  res.json({ success: true, signatures: sigs });
});

// POST — save new signature
router.post('/', requireAuth, (req, res) => {
  const { name, imageData, type } = req.body;
  if (!imageData) return res.status(400).json({ success: false, message: 'imageData is required' });

  const sigs = readSigs();
  const sig = {
    id: 'SIG' + uuidv4().split('-')[0].toUpperCase(),
    userId: req.session.user.id,
    name: name || 'My Signature',
    type: type || 'drawn',
    imageData,
    createdAt: new Date().toISOString()
  };
  sigs.push(sig);
  writeSigs(sigs);
  res.json({ success: true, signature: sig });
});

// DELETE — delete saved signature
router.delete('/:id', requireAuth, (req, res) => {
  const sigs = readSigs();
  const idx = sigs.findIndex(s => s.id === req.params.id && s.userId === req.session.user.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Signature not found' });

  sigs.splice(idx, 1);
  writeSigs(sigs);
  res.json({ success: true });
});

module.exports = router;
