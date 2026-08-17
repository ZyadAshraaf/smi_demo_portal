const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const metaPath = path.join(__dirname, '../../data/ems-metadata.json');
const dtPath   = path.join(__dirname, '../../data/ems-doctypes.json');

const readMeta  = () => JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const writeMeta = d  => fs.writeFileSync(metaPath, JSON.stringify(d, null, 2));
const readTypes = () => JSON.parse(fs.readFileSync(dtPath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET — list all metadata collections
router.get('/', requireAuth, (req, res) => {
  res.json({ success: true, collections: readMeta() });
});

// GET — single collection
router.get('/:id', requireAuth, (req, res) => {
  const collection = readMeta().find(c => c.id === req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  res.json({ success: true, collection });
});

// POST — create metadata collection
router.post('/', requireAuth, (req, res) => {
  const { name, description, fields } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

  const collections = readMeta();
  const collection = {
    id: 'MC' + uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase(),
    name: name.trim(),
    description: description?.trim() || '',
    fields: Array.isArray(fields) ? fields : []
  };
  collections.push(collection);
  writeMeta(collections);
  res.json({ success: true, collection });
});

// PUT — update metadata collection (name, description, fields)
router.put('/:id', requireAuth, (req, res) => {
  const collections = readMeta();
  const idx = collections.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Collection not found' });

  const { name, description, fields } = req.body;
  if (name !== undefined) collections[idx].name = name.trim();
  if (description !== undefined) collections[idx].description = description.trim();
  if (fields !== undefined) collections[idx].fields = Array.isArray(fields) ? fields : [];

  writeMeta(collections);
  res.json({ success: true, collection: collections[idx] });
});

// DELETE — delete collection (blocked if any doctype references it)
router.delete('/:id', requireAuth, (req, res) => {
  const collections = readMeta();
  const types = readTypes();

  const inUse = types.some(dt => dt.metadataId === req.params.id);
  if (inUse) {
    return res.status(400).json({ success: false, message: 'Cannot delete: a document type is using this collection' });
  }

  const remaining = collections.filter(c => c.id !== req.params.id);
  if (remaining.length === collections.length) {
    return res.status(404).json({ success: false, message: 'Collection not found' });
  }

  writeMeta(remaining);
  res.json({ success: true });
});

module.exports = router;
