const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const appraisalsPath = path.join(__dirname, '../data/appraisals.json');
const usersPath      = path.join(__dirname, '../data/users.json');
const tasksPath      = path.join(__dirname, '../data/tasks.json');

const read      = () => JSON.parse(fs.readFileSync(appraisalsPath, 'utf8'));
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const readTasks = () => JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const write     = d  => fs.writeFileSync(appraisalsPath, JSON.stringify(d, null, 2));
const writeTasks= d  => fs.writeFileSync(tasksPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/appraisal — list plans for current user
router.get('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  const users   = readUsers();
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  let plans = read();

  // Employees see only their own; managers/admins/hr see own + team plans
  if (user.role === 'employee') {
    plans = plans.filter(p => p.userId === user.id);
  } else {
    plans = plans.filter(p =>
      p.userId    === user.id ||
      p.reviewedBy === user.id ||
      user.role === 'admin' ||
      user.role === 'hr'
    );
  }

  plans = plans.map(p => ({
    ...p,
    userName:     userMap[p.userId]?.name     || 'Unknown',
    reviewerName: userMap[p.reviewedBy]?.name || 'Unknown',
    userDept:     userMap[p.userId]?.department || '',
    userJobTitle: userMap[p.userId]?.jobTitle   || ''
  }));

  res.json({ success: true, plans });
});

// GET /api/appraisal/:id — single plan
router.get('/:id', requireAuth, (req, res) => {
  const plans = read();
  const users = readUsers();
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  const plan = plans.find(p => p.id === req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Not found' });

  res.json({
    success: true,
    plan: {
      ...plan,
      userName:     userMap[plan.userId]?.name     || 'Unknown',
      reviewerName: userMap[plan.reviewedBy]?.name || 'Unknown',
      userDept:     userMap[plan.userId]?.department || '',
      userJobTitle: userMap[plan.userId]?.jobTitle   || ''
    }
  });
});

// PUT /api/appraisal/:id/objectives/save — employee saves objectives draft
router.put('/:id/objectives/save', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  if (req.body.objectives) plans[idx].objectives = req.body.objectives;
  write(plans);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/objectives/submit — employee submits objectives for approval
router.put('/:id/objectives/submit', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  if (req.body.objectives) plans[idx].objectives = req.body.objectives;
  plans[idx].objectivesStatus      = 'pending-line-manager';
  plans[idx].objectivesSubmittedAt = new Date().toISOString();

  // Create approval task for manager
  const tasks  = readTasks();
  const taskId = 'T' + uuidv4().replace(/-/g, '').substring(0, 7).toUpperCase();
  tasks.push({
    id:          taskId,
    title:       'Performance Management - Setting Objectives - Line Manager Approval',
    description: `Review and approve objectives for ${plans[idx].planName}`,
    assignedTo:  plans[idx].reviewedBy,
    assignedBy:  req.session.user.id,
    status:      'pending',
    priority:    'high',
    type:        'approval',
    createdAt:   new Date().toISOString(),
    dueDate:     null,
    metadata:    { planId: plans[idx].id, approvalType: 'objectives' },
    history:     [],
    comments:    []
  });

  write(plans);
  writeTasks(tasks);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/objectives/approve — manager approves objectives
router.put('/:id/objectives/approve', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  if (req.body.objectives) plans[idx].objectives = req.body.objectives;
  plans[idx].objectivesStatus      = 'approved';
  plans[idx].objectivesApprovedAt  = new Date().toISOString();
  write(plans);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/objectives/return — manager returns objectives for correction
router.put('/:id/objectives/return', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  plans[idx].objectivesStatus = 'returned';
  write(plans);
  res.json({ success: true });
});

// POST /api/appraisal/:id/objectives/item — create new objective
router.post('/:id/objectives/item', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  const obj = {
    id:                   'obj' + uuidv4().replace(/-/g, '').substring(0, 8),
    name:                 req.body.name || '',
    weightingScale:       req.body.weightingScale || 0,
    startDate:            req.body.startDate || '',
    targetDate:           req.body.targetDate || '',
    group:                req.body.group || 'Customer',
    priority:             req.body.priority || 'High',
    appraise:             req.body.appraise !== false,
    measurementStyle:     req.body.measurementStyle || 'Quantitative',
    measureName:          req.body.measureName || '',
    unitOfMeasure:        req.body.unitOfMeasure || '',
    measureType:          req.body.measureType || '',
    targetValue:          req.body.targetValue || '',
    description:          req.body.description || '',
    attachments:          [],
    complete:             null,
    actualAchievementDate:null,
    achievementDate:      null,
    nextReviewerDate:     null,
    comments:             '',
    appraisedPerformance: 'Meet the target'
  };

  plans[idx].objectives.push(obj);
  write(plans);
  res.json({ success: true, objective: obj });
});

// PUT /api/appraisal/:id/objectives/item/:objId — update objective
router.put('/:id/objectives/item/:objId', requireAuth, (req, res) => {
  const plans  = read();
  const idx    = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  const objIdx = plans[idx].objectives.findIndex(o => o.id === req.params.objId);
  if (objIdx === -1) return res.status(404).json({ success: false });

  plans[idx].objectives[objIdx] = { ...plans[idx].objectives[objIdx], ...req.body };
  write(plans);
  res.json({ success: true, objective: plans[idx].objectives[objIdx] });
});

// DELETE /api/appraisal/:id/objectives/item/:objId — delete objective
router.delete('/:id/objectives/item/:objId', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  plans[idx].objectives = plans[idx].objectives.filter(o => o.id !== req.params.objId);
  write(plans);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/track — save tracking progress
router.put('/:id/track', requireAuth, (req, res) => {
  const plans   = read();
  const idx     = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  const { updates } = req.body; // array of { id, complete, actualAchievementDate, achievementDate, nextReviewerDate, comments }
  if (Array.isArray(updates)) {
    updates.forEach(u => {
      const oi = plans[idx].objectives.findIndex(o => o.id === u.id);
      if (oi !== -1) {
        Object.assign(plans[idx].objectives[oi], u);
      }
    });
  }

  write(plans);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/appraisal/save — save appraisal form
router.put('/:id/appraisal/save', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  _applyAppraisalBody(plans[idx], req.body);
  write(plans);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/appraisal/submit — submit appraisal for manager approval
router.put('/:id/appraisal/submit', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  _applyAppraisalBody(plans[idx], req.body);
  plans[idx].appraisalStatus      = 'pending-line-manager';
  plans[idx].appraisalSubmittedAt = new Date().toISOString();

  // Create approval task for manager
  const tasks  = readTasks();
  const taskId = 'T' + uuidv4().replace(/-/g, '').substring(0, 7).toUpperCase();
  tasks.push({
    id:          taskId,
    title:       'Appraisal - Line Manager Approval',
    description: `Review and approve appraisal for ${plans[idx].planName}`,
    assignedTo:  plans[idx].reviewedBy,
    assignedBy:  req.session.user.id,
    status:      'pending',
    priority:    'high',
    type:        'approval',
    createdAt:   new Date().toISOString(),
    dueDate:     null,
    metadata:    { planId: plans[idx].id, approvalType: 'appraisal' },
    history:     [],
    comments:    []
  });

  write(plans);
  writeTasks(tasks);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/appraisal/approve — manager approves appraisal
router.put('/:id/appraisal/approve', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  plans[idx].appraisalStatus = 'completed';
  plans[idx].completedAt     = new Date().toISOString();
  const score                = plans[idx].overallRating?.totalOverallRating || 0;
  plans[idx].finalScore      = score;
  plans[idx].finalRating     = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1;
  plans[idx].finalRatingLabel= plans[idx].overallRating?.overallRating || '';
  write(plans);
  res.json({ success: true });
});

// PUT /api/appraisal/:id/appraisal/reject — manager rejects appraisal
router.put('/:id/appraisal/reject', requireAuth, (req, res) => {
  const plans = read();
  const idx   = plans.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  plans[idx].appraisalStatus = 'draft';
  write(plans);
  res.json({ success: true });
});

function _applyAppraisalBody(plan, body) {
  if (body.appraisalDetails) {
    plan.appraisalDetails = { ...plan.appraisalDetails, ...body.appraisalDetails };
  }
  if (body.competencies) {
    plan.competencies = body.competencies;
  }
  if (Array.isArray(body.objectiveRatings)) {
    body.objectiveRatings.forEach(u => {
      const oi = plan.objectives.findIndex(o => o.id === u.id);
      if (oi !== -1) plan.objectives[oi].appraisedPerformance = u.appraisedPerformance;
    });
  }
  if (body.overallRating) {
    plan.overallRating = { ...plan.overallRating, ...body.overallRating };
  }
}

module.exports = router;
