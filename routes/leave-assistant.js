const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { notifyLeaveRequest } = require('../utils/teamsNotify');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

const leavesPath    = path.join(__dirname, '../data/leaves.json');
const wfhPath       = path.join(__dirname, '../data/wfh.json');
const travelPath    = path.join(__dirname, '../data/travel.json');
const tasksPath     = path.join(__dirname, '../data/tasks.json');
const usersPath     = path.join(__dirname, '../data/users.json');
const helpdeskPath  = path.join(__dirname, '../data/helpdesk.json');

const readLeaves    = () => JSON.parse(fs.readFileSync(leavesPath,   'utf8'));
const readWfh       = () => JSON.parse(fs.readFileSync(wfhPath,      'utf8'));
const readTravel    = () => JSON.parse(fs.readFileSync(travelPath,   'utf8'));
const readTasks     = () => JSON.parse(fs.readFileSync(tasksPath,    'utf8'));
const readUsers     = () => JSON.parse(fs.readFileSync(usersPath,    'utf8'));
const readHelpdesk  = () => JSON.parse(fs.readFileSync(helpdeskPath, 'utf8'));
const writeLeaves   = d => fs.writeFileSync(leavesPath,   JSON.stringify(d, null, 2));
const writeWfh      = d => fs.writeFileSync(wfhPath,      JSON.stringify(d, null, 2));
const writeTravel   = d => fs.writeFileSync(travelPath,   JSON.stringify(d, null, 2));
const writeTasks    = d => fs.writeFileSync(tasksPath,    JSON.stringify(d, null, 2));
const writeHelpdesk = d => fs.writeFileSync(helpdeskPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// ── User's helpdesk tickets ───────────────────────────────────────────────────
function getHelpdeskTickets(userId) {
  const tickets = readHelpdesk().filter(t => t.submittedBy === userId);
  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);
  return tickets.map(t => ({
    ticketNo:   t.ticketNo,
    title:      t.title,
    status:     t.status,
    priority:   t.priority,
    category:   t.category,
    assignedTo: userMap[t.assignedTo] || 'Unassigned',
    createdAt:  t.createdAt.split('T')[0]
  }));
}

// ── Leave balance ─────────────────────────────────────────────────────────────
function getLeaveBalance(userId) {
  const leaves = readLeaves();
  const year   = new Date().getFullYear();
  const mine   = leaves.filter(l => l.userId === userId && l.status !== 'rejected');

  const usedAnnual = mine
    .filter(l => l.type === 'annual' && new Date(l.startDate).getFullYear() === year)
    .reduce((s, l) => s + (l.days || 0), 0);
  const usedSick = mine
    .filter(l => l.type === 'sick' && new Date(l.startDate).getFullYear() === year)
    .reduce((s, l) => s + (l.days || 0), 0);

  return {
    annual: { total: 21, used: usedAnnual, remaining: Math.max(0, 21 - usedAnnual) },
    sick:   { total: 30, used: usedSick,   remaining: Math.max(0, 30 - usedSick) }
  };
}

// ── Working days between two dates (Mon–Fri) ──────────────────────────────────
function workingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  const fin = new Date(end);
  while (cur <= fin) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(user, balance, tickets) {
  const today = new Date().toISOString().split('T')[0];

  const ticketLines = tickets.length
    ? tickets.map(t =>
        `  • ${t.ticketNo} | "${t.title}" | Status: ${t.status} | Priority: ${t.priority} | Category: ${t.category} | Assigned To: ${t.assignedTo} | Submitted: ${t.createdAt}`
      ).join('\n')
    : '  (No tickets submitted yet)';

  return `You are My Assistant — a smart, friendly workplace assistant embedded in the Unified Workspace platform.

TODAY: ${today}
EMPLOYEE: ${user.name} | Role: ${user.role} | Dept: ${user.department || 'N/A'}

LEAVE BALANCE (${new Date().getFullYear()}):
- Annual Leave: ${balance.annual.remaining} days remaining (${balance.annual.used} used of ${balance.annual.total})
- Sick Leave: ${balance.sick.remaining} days remaining (${balance.sick.used} used of ${balance.sick.total})
- Emergency / Maternity / Paternity / Unpaid: available with no fixed cap

MY HELPDESK TICKETS (submitted by this employee):
${ticketLines}

YOU CAN HANDLE FOUR REQUEST TYPES:

━━ 1. LEAVE REQUEST ━━
Collect: leave type (annual/sick/emergency/maternity/paternity/unpaid), start date, end date, reason.
Calculate working days (Mon–Fri only).
When confirmed, output on a new line:
<<<SUBMIT_LEAVE>>>
{"type":"annual","startDate":"2026-04-15","endDate":"2026-04-17","days":3,"reason":"Family vacation"}

━━ 2. WORK FROM HOME (WFH) ━━
Collect: start date, end date, reason.
Calculate working days (Mon–Fri only).
When confirmed, output on a new line:
<<<SUBMIT_WFH>>>
{"startDate":"2026-04-15","endDate":"2026-04-15","days":1,"reason":"Focus work on project"}

━━ 3. BUSINESS TRAVEL ━━
Collect: destination city, origin city, departure date, return date, trip purpose, travel class (economy/business, default economy).
Calculate days.
When confirmed, output on a new line:
<<<SUBMIT_TRAVEL>>>
{"destination":"Dubai","origin":"Riyadh","departureDate":"2026-04-20","returnDate":"2026-04-23","days":4,"purpose":"Client meeting","travelClass":"economy"}

━━ 4. HELPDESK IT SUPPORT TICKET ━━
Collect: brief title/summary, description of the problem, and category.
Categories: Access & Permissions | Hardware | Software | Network | Training | General
Priority rules (do NOT ask explicitly — infer from context):
  - "critical" if user says: critical / blocking / cannot work / emergency
  - "high" if user says: urgent / ASAP / important / affecting the team
  - "medium" otherwise (default)
Show a summary then ask for confirmation.
When confirmed, output on a new line:
<<<SUBMIT_HELPDESK>>>
{"title":"Cannot access email","category":"Software","priority":"medium","description":"I cannot log into Outlook. It shows an account locked error."}

━━ TICKET TRACKING ━━
- If asked about a ticket status, look it up from MY HELPDESK TICKETS above and report: status, assigned to, priority, and when it was submitted.
- If asked to list tickets, summarize them in a clean readable list.
- Status meanings: open = waiting for IT to start | in_progress = IT is working on it | resolved = IT marked it fixed (awaiting your confirmation) | closed = completed | reopened = you reopened it after resolution.
- Do NOT take workflow actions (Close, Reopen) via chat. If the user wants to close or reopen, direct them to the Help Desk page.

CONVERSATION RULES:
- LANGUAGE: Detect the language of each user message. If the user writes in Arabic, respond entirely in Arabic. If English, respond in English. Match their language on every reply.
- Greet warmly. Ask what they need help with today.
- Identify the request type early then collect missing info through natural conversation.
- Show a clear summary of all details before asking for confirmation.
- Only produce a <<<SUBMIT_*>>> block after the employee explicitly confirms.
- Never produce a submit block more than once per conversation.
- Parse relative dates ("next Monday", "this Friday", "from the 20th") using TODAY's date.
- Warn if leave balance is insufficient — do not block, just inform.
- If asked about balance, answer clearly from the data above.
- Be concise, warm, and professional.`;
}

// ── Shared task creator ───────────────────────────────────────────────────────
function createApprovalTask({ id, title, description, managerId, userId, dueDate, metadata }) {
  const tasks = readTasks();
  const taskId = 'T' + uuidv4().split('-')[0].toUpperCase();
  tasks.push({
    id:           taskId,
    title,
    description,
    sourceSystem: 'HR',
    type:         'approval',
    priority:     'medium',
    status:       'pending',
    assignedTo:   managerId,
    createdBy:    userId,
    dueDate,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    metadata,
    history:      [{ action: 'created', by: userId, at: new Date().toISOString(), note: 'Submitted via My Assistant' }],
    comments:     [],
    escalated:    false,
    delegatedFrom: null
  });
  writeTasks(tasks);
  return taskId;
}

// ── Submit handlers ───────────────────────────────────────────────────────────
function submitLeave(user, data) {
  const users    = readUsers();
  const leaves   = readLeaves();
  const employee = users.find(u => u.id === user.id);
  const managerId = employee?.managerId || null;

  const leaveId = 'L' + uuidv4().split('-')[0].toUpperCase();
  const leave = {
    id:          leaveId,
    userId:      user.id,
    type:        data.type,
    startDate:   data.startDate,
    endDate:     data.endDate,
    days:        data.days,
    reason:      data.reason || '',
    status:      'pending',
    taskId:      null,
    submittedAt: new Date().toISOString(),
    reviewedBy:  null,
    reviewedAt:  null,
    reviewNote:  ''
  };

  if (managerId) {
    leave.taskId = createApprovalTask({
      title:       `Approve Leave Request — ${user.name}`,
      description: `${user.name} has requested ${data.type} leave for ${data.days} day(s) (${data.startDate} to ${data.endDate}). Reason: ${data.reason}`,
      managerId, userId: user.id, dueDate: data.startDate,
      metadata: { leaveId }
    });
    const manager = users.find(u => u.id === managerId);
    notifyLeaveRequest({ managerEmail: manager?.email || null, employeeName: user.name, leaveType: data.type, startDate: data.startDate, endDate: data.endDate, days: data.days });
  }

  leaves.push(leave);
  writeLeaves(leaves);
  return { id: leaveId, type: 'leave' };
}

function submitWfh(user, data) {
  const users    = readUsers();
  const records  = readWfh();
  const employee = users.find(u => u.id === user.id);
  const managerId = employee?.managerId || null;

  const wfhId = 'W' + uuidv4().split('-')[0].toUpperCase();
  const wfh = {
    id:          wfhId,
    userId:      user.id,
    startDate:   data.startDate,
    endDate:     data.endDate,
    days:        data.days,
    reason:      data.reason || '',
    status:      'pending',
    taskId:      null,
    submittedAt: new Date().toISOString(),
    reviewedBy:  null,
    reviewedAt:  null,
    reviewNote:  ''
  };

  if (managerId) {
    wfh.taskId = createApprovalTask({
      title:       `Approve WFH Request — ${user.name}`,
      description: `${user.name} has requested to work from home for ${data.days} day(s) (${data.startDate} to ${data.endDate}). Reason: ${data.reason || 'Not provided'}`,
      managerId, userId: user.id, dueDate: data.startDate,
      metadata: { wfhId }
    });
  }

  records.push(wfh);
  writeWfh(records);
  return { id: wfhId, type: 'wfh' };
}

function submitTravel(user, data) {
  const users    = readUsers();
  const records  = readTravel();
  const employee = users.find(u => u.id === user.id);
  const managerId = employee?.managerId || null;

  const travelId = 'TR-' + uuidv4().split('-')[0].toUpperCase();

  // Basic cost estimate (mirrors travel.js logic)
  const days = data.days || workingDays(data.departureDate, data.returnDate);
  const flightCost = 1200;
  const hotelCost  = 500 * Math.max(days - 1, 0);
  const perDiem    = 300 * days;
  const total      = flightCost + hotelCost + perDiem;

  const record = {
    id:            travelId,
    userId:        user.id,
    destination:   data.destination,
    origin:        data.origin || 'Riyadh',
    purpose:       data.purpose,
    departureDate: data.departureDate,
    returnDate:    data.returnDate,
    days,
    travelers:     1,
    travelClass:   data.travelClass || 'economy',
    flight:        null,
    hotel:         null,
    costBreakdown: { flight: flightCost, hotel: hotelCost, perDiem, transport: 0, other: 0, total },
    status:        'pending',
    taskId:        null,
    submittedAt:   new Date().toISOString(),
    reviewedBy:    null,
    reviewedAt:    null,
    reviewNote:    ''
  };

  if (managerId) {
    record.taskId = createApprovalTask({
      title:       `Approve Business Trip — ${user.name}`,
      description: `${user.name} has requested a business trip to ${data.destination} for ${days} day(s) (${data.departureDate} to ${data.returnDate}). Purpose: ${data.purpose}. Estimated cost: SAR ${total.toLocaleString()}.`,
      managerId, userId: user.id, dueDate: data.departureDate,
      metadata:    { travelId },
    });
  }

  records.push(record);
  writeTravel(records);
  return { id: travelId, type: 'travel' };
}

function submitHelpdesk(user, data) {
  const tickets = readHelpdesk();
  const nextNum = tickets.length + 1;
  const ticketId = 'HD' + uuidv4().split('-')[0].toUpperCase();

  const ticket = {
    id:          ticketId,
    ticketNo:    `TKT-2026-${String(nextNum).padStart(3, '0')}`,
    title:       data.title,
    description: data.description || '',
    category:    data.category    || 'General',
    priority:    data.priority    || 'medium',
    status:      'open',
    submittedBy: user.id,
    assignedTo:  null,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    comments:    [],
    history:     [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Ticket submitted via My Assistant' }]
  };

  tickets.push(ticket);
  writeHelpdesk(tickets);
  return { id: ticketId, ticketNo: ticket.ticketNo, type: 'helpdesk' };
}

// ── GET /api/leave-assistant/balance ─────────────────────────────────────────
router.get('/balance', requireAuth, (req, res) => {
  res.json({ success: true, balance: getLeaveBalance(req.session.user.id) });
});

// ── POST /api/leave-assistant/chat ───────────────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const user     = req.session.user;
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'messages array required' });
  }

  const balance      = getLeaveBalance(user.id);
  const hdTickets    = getHelpdeskTickets(user.id);
  const systemPrompt = buildSystemPrompt(user, balance, hdTickets);

  try {
    const groqRes = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens:  900
      })
    });

    if (!groqRes.ok) {
      console.error('Groq error:', await groqRes.text());
      return res.status(502).json({ success: false, message: 'AI service unavailable. Please try again.' });
    }

    let aiText = (await groqRes.json())?.choices?.[0]?.message?.content || 'Sorry, I could not respond.';

    // ── Detect which submit marker is present ─────────────────────────────
    const markers = ['<<<SUBMIT_LEAVE>>>', '<<<SUBMIT_WFH>>>', '<<<SUBMIT_TRAVEL>>>', '<<<SUBMIT_HELPDESK>>>'];
    const found   = markers.find(m => aiText.includes(m));

    if (found) {
      const markerIdx   = aiText.indexOf(found);
      const displayText = aiText.slice(0, markerIdx).trim();
      const afterMarker = aiText.slice(markerIdx + found.length);

      // Robustly extract JSON — handles code fences and trailing text
      const jsonMatch = afterMarker.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.json({ success: true, message: displayText || 'I understood your request but could not process it. Please try again.', submitted: false });
      }

      let data;
      try { data = JSON.parse(jsonMatch[0]); } catch {
        return res.json({ success: true, message: displayText || 'I understood your request but could not process it. Please try again.', submitted: false });
      }

      let result;
      try {
        if      (found === '<<<SUBMIT_LEAVE>>>')     result = submitLeave(user, data);
        else if (found === '<<<SUBMIT_WFH>>>')       result = submitWfh(user, data);
        else if (found === '<<<SUBMIT_TRAVEL>>>')    result = submitTravel(user, data);
        else                                          result = submitHelpdesk(user, data);
      } catch (submitErr) {
        console.error('leave-assistant submission error:', submitErr);
        return res.status(500).json({ success: false, message: 'Failed to submit your request. Please try again.' });
      }

      const typeLabels = { leave: 'Leave request', wfh: 'Work-from-home request', travel: 'Business travel request', helpdesk: 'Support ticket' };
      const fallback   = `${typeLabels[result.type] || 'Request'} submitted successfully!`;
      const replyText  = displayText || fallback;

      return res.json({ success: true, message: replyText, submitted: true, ...result });
    }

    res.json({ success: true, message: aiText, submitted: false });

  } catch (err) {
    console.error('leave-assistant error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
