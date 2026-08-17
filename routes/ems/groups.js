const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const groupsPath = path.join(__dirname, '../../data/ems-groups.json');
const usersPath  = path.join(__dirname, '../../data/users.json');
const auditPath  = path.join(__dirname, '../../data/ems-audit.json');

const readGroups  = () => JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
const writeGroups = d => fs.writeFileSync(groupsPath, JSON.stringify(d, null, 2));
const readUsers   = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
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

// GET — list groups
router.get('/', requireAuth, (req, res) => {
  const groups = readGroups();
  const user = req.session.user;
  // Admin sees all; others see groups they belong to
  const filtered = (user.role === 'admin' || user.role === 'hr')
    ? groups
    : groups.filter(g => g.members.includes(user.id));
  res.json({ success: true, groups: filtered });
});

// GET — single group with member details
router.get('/:id', requireAuth, (req, res) => {
  const group = readGroups().find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

  const users = readUsers();
  const memberDetails = group.members.map(mId => {
    const u = users.find(usr => usr.id === mId);
    return u ? { id: u.id, name: u.name, email: u.email, role: u.role, department: u.department } : { id: mId, name: 'Unknown' };
  });

  res.json({ success: true, group: { ...group, memberDetails } });
});

// POST — create group
router.post('/', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user.role !== 'admin' && user.role !== 'manager') {
    return res.status(403).json({ success: false, message: 'Admin or manager only' });
  }

  const { name, description, members, permissions } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

  const groups = readGroups();
  const group = {
    id: 'GRP' + uuidv4().split('-')[0].toUpperCase(),
    name: name.trim(),
    description: (description || '').trim(),
    members: members || [],
    permissions: permissions || [],
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  groups.push(group);
  writeGroups(groups);
  logAudit('group.create', 'group', group.id, group.name, user, `Created group "${group.name}"`);
  res.json({ success: true, group });
});

// PUT — update group
router.put('/:id', requireAuth, (req, res) => {
  const groups = readGroups();
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });

  const allowed = ['name', 'description'];
  allowed.forEach(key => { if (req.body[key] !== undefined) groups[idx][key] = req.body[key]; });
  groups[idx].updatedAt = new Date().toISOString();

  writeGroups(groups);
  logAudit('group.update', 'group', groups[idx].id, groups[idx].name, req.session.user, `Updated group "${groups[idx].name}"`);
  res.json({ success: true, group: groups[idx] });
});

// DELETE — delete group (admin only)
router.delete('/:id', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

  const groups = readGroups();
  const group = groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

  const remaining = groups.filter(g => g.id !== req.params.id);
  writeGroups(remaining);
  logAudit('group.delete', 'group', group.id, group.name, req.session.user, `Deleted group "${group.name}"`);
  res.json({ success: true });
});

// POST — add members
router.post('/:id/members', requireAuth, (req, res) => {
  const { userIds } = req.body;
  if (!userIds || !Array.isArray(userIds)) return res.status(400).json({ success: false, message: 'userIds array is required' });

  const groups = readGroups();
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });

  userIds.forEach(uid => {
    if (!groups[idx].members.includes(uid)) groups[idx].members.push(uid);
  });
  groups[idx].updatedAt = new Date().toISOString();

  writeGroups(groups);
  logAudit('group.memberAdd', 'group', groups[idx].id, groups[idx].name, req.session.user, `Added ${userIds.length} member(s)`);
  res.json({ success: true, group: groups[idx] });
});

// DELETE — remove member
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const groups = readGroups();
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });

  groups[idx].members = groups[idx].members.filter(m => m !== req.params.userId);
  groups[idx].updatedAt = new Date().toISOString();

  writeGroups(groups);
  logAudit('group.memberRemove', 'group', groups[idx].id, groups[idx].name, req.session.user, `Removed member ${req.params.userId}`);
  res.json({ success: true, group: groups[idx] });
});

// POST — add/update folder permission
router.post('/:id/permissions', requireAuth, (req, res) => {
  const { folderId, level, inherited } = req.body;
  if (!folderId || !level) return res.status(400).json({ success: false, message: 'folderId and level are required' });

  const groups = readGroups();
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });

  const permIdx = groups[idx].permissions.findIndex(p => p.folderId === folderId);
  if (permIdx !== -1) {
    groups[idx].permissions[permIdx] = { folderId, level, inherited: inherited !== false };
  } else {
    groups[idx].permissions.push({ folderId, level, inherited: inherited !== false });
  }
  groups[idx].updatedAt = new Date().toISOString();

  writeGroups(groups);
  res.json({ success: true, group: groups[idx] });
});

// DELETE — remove folder permission
router.delete('/:id/permissions/:folderId', requireAuth, (req, res) => {
  const groups = readGroups();
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Group not found' });

  groups[idx].permissions = groups[idx].permissions.filter(p => p.folderId !== req.params.folderId);
  groups[idx].updatedAt = new Date().toISOString();

  writeGroups(groups);
  res.json({ success: true, group: groups[idx] });
});

module.exports = router;
