const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const helpdeskPath = path.join(__dirname, '../data/helpdesk.json');
const usersPath    = path.join(__dirname, '../data/users.json');

const read      = () => JSON.parse(fs.readFileSync(helpdeskPath, 'utf8'));
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const write     = d  => fs.writeFileSync(helpdeskPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

const TRANSITIONS = {
  open:        { in_progress: true },
  reopened:    { in_progress: true },
  in_progress: { resolved:    true },
  resolved:    { closed:      true, reopened: true }
};

// GET /api/helpdesk — list tickets (employees see only their own)
router.get('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  let tickets   = read();
  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  if (user.role === 'employee') {
    tickets = tickets.filter(t => t.submittedBy === user.id);
  }

  tickets = tickets.map(t => ({
    ...t,
    submittedByName: userMap[t.submittedBy] || 'Unknown',
    assignedToName:  userMap[t.assignedTo]  || 'Unassigned'
  }));

  res.json({ success: true, tickets });
});

// GET /api/helpdesk/:id — single ticket
router.get('/:id', requireAuth, (req, res) => {
  const user    = req.session.user;
  const tickets = read();
  const ticket  = tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  if (user.role === 'employee' && ticket.submittedBy !== user.id)
    return res.status(403).json({ success: false, message: 'Forbidden' });

  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  res.json({
    success: true,
    ticket: {
      ...ticket,
      submittedByName: userMap[ticket.submittedBy] || 'Unknown',
      assignedToName:  userMap[ticket.assignedTo]  || 'Unassigned'
    }
  });
});

// POST /api/helpdesk — create ticket
router.post('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  const tickets = read();
  const nextNum = tickets.length + 1;

  const ticket = {
    id:          'HD' + uuidv4().split('-')[0].toUpperCase(),
    ticketNo:    `TKT-2026-${String(nextNum).padStart(3, '0')}`,
    title:       req.body.title,
    description: req.body.description || '',
    category:    req.body.category    || 'General',
    priority:    req.body.priority    || 'medium',
    status:      'open',
    submittedBy: user.id,
    assignedTo:  null,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    comments:    [],
    history:     [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Ticket submitted' }]
  };

  tickets.push(ticket);
  write(tickets);
  res.json({ success: true, ticket });
});

// PUT /api/helpdesk/:id — workflow action or field update
router.put('/:id', requireAuth, (req, res) => {
  const user    = req.session.user;
  const tickets = read();
  const idx     = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Ticket not found' });

  const t          = tickets[idx];
  const isEmployee = user.role === 'employee';
  const isIT       = !isEmployee;
  const isSubmitter= t.submittedBy === user.id;

  if (req.body.action) {
    const action = req.body.action;
    let toStatus;

    if (action === 'start') {
      if (!isIT)
        return res.status(403).json({ success: false, message: 'IT staff only' });
      if (!TRANSITIONS[t.status]?.in_progress)
        return res.status(400).json({ success: false, message: `Cannot start from '${t.status}'` });
      toStatus = 'in_progress';
      if (!t.assignedTo) t.assignedTo = user.id;

    } else if (action === 'resolve') {
      if (!isIT)
        return res.status(403).json({ success: false, message: 'IT staff only' });
      if (!TRANSITIONS[t.status]?.resolved)
        return res.status(400).json({ success: false, message: `Cannot resolve from '${t.status}'` });
      toStatus = 'resolved';

    } else if (action === 'close') {
      if (!isSubmitter)
        return res.status(403).json({ success: false, message: 'Submitter only' });
      if (!TRANSITIONS[t.status]?.closed)
        return res.status(400).json({ success: false, message: `Cannot close from '${t.status}'` });
      toStatus = 'closed';

    } else if (action === 'reopen') {
      if (!isSubmitter)
        return res.status(403).json({ success: false, message: 'Submitter only' });
      if (!TRANSITIONS[t.status]?.reopened)
        return res.status(400).json({ success: false, message: `Cannot reopen from '${t.status}'` });
      toStatus = 'reopened';

    } else {
      return res.status(400).json({ success: false, message: 'Unknown action' });
    }

    t.status = toStatus;
    if (!Array.isArray(t.history)) t.history = [];
    t.history.push({ action: toStatus, by: user.id, at: new Date().toISOString(), note: req.body.note || '' });
  }

  // Non-transition field updates
  ['priority', 'assignedTo'].forEach(f => {
    if (req.body[f] !== undefined) t[f] = req.body[f];
  });

  if (req.body.comment) {
    if (!Array.isArray(t.comments)) t.comments = [];
    t.comments.push({
      by:         user.id,
      name:       user.name,
      at:         new Date().toISOString(),
      text:       req.body.comment,
      isInternal: req.body.isInternal || false
    });
  }

  t.updatedAt = new Date().toISOString();

  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  write(tickets);
  res.json({
    success: true,
    ticket: {
      ...t,
      submittedByName: userMap[t.submittedBy] || 'Unknown',
      assignedToName:  userMap[t.assignedTo]  || 'Unassigned'
    }
  });
});

module.exports = router;
