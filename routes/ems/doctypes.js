const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const dtPath   = path.join(__dirname, '../../data/ems-doctypes.json');
const docsPath = path.join(__dirname, '../../data/ems-documents.json');
const metaPath = path.join(__dirname, '../../data/ems-metadata.json');

const readTypes  = () => JSON.parse(fs.readFileSync(dtPath, 'utf8'));
const writeTypes = d  => fs.writeFileSync(dtPath, JSON.stringify(d, null, 2));
const readDocs   = () => JSON.parse(fs.readFileSync(docsPath, 'utf8'));
const readMeta   = () => {
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
  catch { return []; }
};

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// Build a doctype's full resolved field list from its single metadataId + own fields
function resolveDocTypeFields(dt, collections) {
  const resolved = [];
  const seen = new Set();

  // Fields from the linked metadata collection
  const col = collections.find(c => c.id === dt.metadataId);
  if (col) {
    (col.fields || []).forEach(f => {
      if (!seen.has(f.id)) { seen.add(f.id); resolved.push({ ...f, _fromCollection: col.name }); }
    });
  }

  // Type's own extra fields (skip duplicates)
  (dt.fields || []).forEach(f => {
    if (!seen.has(f.id)) { seen.add(f.id); resolved.push(f); }
  });

  return resolved;
}

// GET — list all document types with fully resolved fields
router.get('/', requireAuth, (req, res) => {
  const collections = readMeta();
  const types = readTypes().map(dt => ({
    ...dt,
    resolvedFields: resolveDocTypeFields(dt, collections)
  }));
  res.json({ success: true, docTypes: types });
});

// POST — create document type
router.post('/', requireAuth, (req, res) => {
  const { name, description, icon, color, fields } = req.body;
  if (!name || !fields || !Array.isArray(fields)) {
    return res.status(400).json({ success: false, message: 'Name and fields are required' });
  }

  const types = readTypes();
  const dt = {
    id: 'DT' + uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase(),
    name: name.trim(),
    description: description || '',
    icon: icon || 'bi-file-earmark',
    color: color || '#6c757d',
    fields   // stored as-is (can contain metadataId refs or inline fields)
  };
  types.push(dt);
  writeTypes(types);
  res.json({ success: true, docType: dt });
});

// PUT — update document type
router.put('/:id', requireAuth, (req, res) => {
  const types = readTypes();
  const idx = types.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document type not found' });

  const allowed = ['name', 'description', 'icon', 'color', 'metadataId', 'fields'];
  allowed.forEach(key => { if (req.body[key] !== undefined) types[idx][key] = req.body[key]; });

  writeTypes(types);
  res.json({ success: true, docType: types[idx] });
});

// DELETE — delete document type (only if no docs use it)
router.delete('/:id', requireAuth, (req, res) => {
  const types = readTypes();
  const docs = readDocs();
  const inUse = docs.some(d => d.docTypeId === req.params.id);
  if (inUse) return res.status(400).json({ success: false, message: 'Cannot delete: documents are using this type' });

  const remaining = types.filter(t => t.id !== req.params.id);
  if (remaining.length === types.length) return res.status(404).json({ success: false, message: 'Document type not found' });

  writeTypes(remaining);
  res.json({ success: true });
});

module.exports = router;
