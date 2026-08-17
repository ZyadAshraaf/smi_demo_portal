const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const usersPath  = path.join(__dirname, '../../data/users.json');
const groupsPath = path.join(__dirname, '../../data/ems-groups.json');
const docsPath   = path.join(__dirname, '../../data/ems-documents.json');

const readUsers  = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const readGroups = () => JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
const readDocs   = () => JSON.parse(fs.readFileSync(docsPath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET — list all users with EMS context
router.get('/', requireAuth, (req, res) => {
  const users = readUsers();
  const groups = readGroups();
  const docs = readDocs();

  const enriched = users.map(u => {
    const userGroups = groups.filter(g => g.members.includes(u.id)).map(g => ({ id: g.id, name: g.name }));
    const docCount = docs.filter(d => d.createdBy === u.id && !d.trashedAt).length;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      jobTitle: u.jobTitle,
      avatar: u.avatar,
      emsGroups: userGroups,
      documentCount: docCount
    };
  });

  res.json({ success: true, users: enriched });
});

module.exports = router;
