const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const foldersPath = path.join(__dirname, '../../data/ems-folders.json');
const docsPath    = path.join(__dirname, '../../data/ems-documents.json');
const auditPath   = path.join(__dirname, '../../data/ems-audit.json');

const readFolders = () => JSON.parse(fs.readFileSync(foldersPath, 'utf8'));
const writeFolders = d => fs.writeFileSync(foldersPath, JSON.stringify(d, null, 2));
const readDocs    = () => JSON.parse(fs.readFileSync(docsPath, 'utf8'));
const readAudit   = () => JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const writeAudit  = d => fs.writeFileSync(auditPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

function logAudit(action, entityType, entityId, entityName, user, details) {
  const audit = readAudit();
  audit.push({
    id: 'AUD' + uuidv4().split('-')[0].toUpperCase(),
    action, entityType, entityId, entityName,
    userId: user.id, userName: user.name,
    details, timestamp: new Date().toISOString()
  });
  writeAudit(audit);
}

// GET — list all folders
router.get('/', requireAuth, (req, res) => {
  const folders = readFolders();
  res.json({ success: true, folders });
});

// POST — create folder
router.post('/', requireAuth, (req, res) => {
  const { name, parentId, color, icon } = req.body;
  if (!name || !parentId) return res.status(400).json({ success: false, message: 'Name and parentId are required' });

  const folders = readFolders();
  const parent = folders.find(f => f.id === parentId);
  if (!parent) return res.status(404).json({ success: false, message: 'Parent folder not found' });

  const siblings = folders.filter(f => f.parentId === parentId);
  const folder = {
    id: 'FLD' + uuidv4().split('-')[0].toUpperCase(),
    name: name.trim(),
    parentId,
    createdBy: req.session.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    color: color || null,
    icon: icon || 'bi-folder',
    sortOrder: siblings.length + 1
  };

  folders.push(folder);
  writeFolders(folders);
  logAudit('folder.create', 'folder', folder.id, folder.name, req.session.user, `Created folder "${folder.name}"`);
  res.json({ success: true, folder });
});

// PUT — rename / update folder
router.put('/:id', requireAuth, (req, res) => {
  const folders = readFolders();
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Folder not found' });
  if (folders[idx].parentId === null) return res.status(400).json({ success: false, message: 'Cannot modify root folder' });

  const allowed = ['name', 'color', 'icon', 'sortOrder'];
  allowed.forEach(key => { if (req.body[key] !== undefined) folders[idx][key] = req.body[key]; });
  folders[idx].updatedAt = new Date().toISOString();

  writeFolders(folders);
  logAudit('folder.update', 'folder', folders[idx].id, folders[idx].name, req.session.user, `Updated folder "${folders[idx].name}"`);
  res.json({ success: true, folder: folders[idx] });
});

// DELETE — delete folder
router.delete('/:id', requireAuth, (req, res) => {
  const folders = readFolders();
  const folder = folders.find(f => f.id === req.params.id);
  if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });
  if (folder.parentId === null) return res.status(400).json({ success: false, message: 'Cannot delete root folder' });

  // Check for children
  const children = folders.filter(f => f.parentId === folder.id);
  const docs = readDocs().filter(d => d.folderId === folder.id && !d.trashedAt);
  const force = req.query.force === 'true';

  if ((children.length > 0 || docs.length > 0) && !force) {
    return res.status(400).json({ success: false, message: 'Folder is not empty. Use ?force=true to delete anyway.' });
  }

  // Collect all descendant folder IDs
  function getDescendants(parentId) {
    const kids = folders.filter(f => f.parentId === parentId);
    let ids = kids.map(k => k.id);
    kids.forEach(k => { ids = ids.concat(getDescendants(k.id)); });
    return ids;
  }
  const toRemove = new Set([folder.id, ...getDescendants(folder.id)]);

  const remaining = folders.filter(f => !toRemove.has(f.id));
  writeFolders(remaining);
  logAudit('folder.delete', 'folder', folder.id, folder.name, req.session.user, `Deleted folder "${folder.name}" and ${toRemove.size - 1} subfolders`);
  res.json({ success: true });
});

// POST — move folder to new parent
router.post('/:id/move', requireAuth, (req, res) => {
  const { newParentId } = req.body;
  if (!newParentId) return res.status(400).json({ success: false, message: 'newParentId is required' });

  const folders = readFolders();
  const idx = folders.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Folder not found' });
  if (folders[idx].parentId === null) return res.status(400).json({ success: false, message: 'Cannot move root folder' });

  // Prevent moving into own descendant
  function getDescendants(parentId) {
    const kids = folders.filter(f => f.parentId === parentId);
    let ids = kids.map(k => k.id);
    kids.forEach(k => { ids = ids.concat(getDescendants(k.id)); });
    return ids;
  }
  const descendants = getDescendants(req.params.id);
  if (newParentId === req.params.id || descendants.includes(newParentId)) {
    return res.status(400).json({ success: false, message: 'Cannot move folder into itself or its own descendant' });
  }

  folders[idx].parentId = newParentId;
  folders[idx].updatedAt = new Date().toISOString();
  writeFolders(folders);
  logAudit('folder.move', 'folder', folders[idx].id, folders[idx].name, req.session.user, `Moved folder "${folders[idx].name}"`);
  res.json({ success: true, folder: folders[idx] });
});

module.exports = router;
