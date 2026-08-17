/**
 * Material Requisition (MRQ) Workflow Tests
 *
 * Covers:
 *   - Task assigned to correct approver per submitter role
 *   - CEO self-approval: task created and assigned to self
 *   - Urgent priority → task priority "high"
 *   - Approve path: MRQ status → approved, task status → approved
 *   - Reject  path: MRQ status → rejected, task status → rejected
 */

const { login, post, put, assert, assertEqual, USERS, readData, cleanupRecord, cleanupTask, suite, test } = require('../helpers');

function mrqBody(priority = 'normal') {
  return {
    department:       'Finance',
    deliveryLocation: 'Riyadh HQ',
    requiredBy:       '2026-06-30',
    priority,
    projectCode:      'FIN-TEST',
    justification:    '[TEST] MRQ workflow test',
    lineItems: [
      {
        materialCode:  'MAT-001',
        materialName:  'A4 Paper Ream (500 sheets)',
        category:      'Stationery',
        uom:           'Ream',
        qtyRequested:  5,
        stockAvailable: 120,
      },
    ],
  };
}

async function runMRQTests() {
  suite('Material Requisition (MRQ) Workflow');

  // ── Assignment tests ──────────────────────────────────────────────────────

  await test('Employee (Sara) submits → task assigned to Manager (Khalid)', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/material-requisitions', mrqBody(), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: mrqId, taskId } = res.mrq;

    try {
      assert(taskId, 'No taskId on MRQ record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.manager.id, 'task.assignedTo');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Manager (Khalid) submits → task assigned to CEO (Ahmed)', async () => {
    const cookie = await login('manager');
    const res    = await post('/api/material-requisitions', mrqBody(), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: mrqId, taskId } = res.mrq;

    try {
      assert(taskId, 'No taskId on MRQ record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('CEO (Ahmed) submits → task assigned to self (Ahmed)', async () => {
    const cookie = await login('ceo');
    const res    = await post('/api/material-requisitions', mrqBody(), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: mrqId, taskId } = res.mrq;

    try {
      assert(taskId, 'No taskId on MRQ record — CEO self-approval task not created');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Urgent priority → task priority is "high"', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/material-requisitions', mrqBody('urgent'), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: mrqId, taskId } = res.mrq;

    try {
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.priority, 'high', 'task.priority');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Normal priority → task priority is "medium"', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/material-requisitions', mrqBody('normal'), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: mrqId, taskId } = res.mrq;

    try {
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.priority, 'medium', 'task.priority');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Approve path ──────────────────────────────────────────────────────────

  await test('Approve: MRQ status → approved, task status → approved', async () => {
    const submitCookie  = await login('employee');
    const approveCookie = await login('manager');

    const submitRes = await post('/api/material-requisitions', mrqBody(), submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: mrqId, taskId } = submitRes.mrq;

    try {
      const approveRes = await put(`/api/material-requisitions/${mrqId}/approve`, { note: 'Test approval' }, approveCookie);
      assert(approveRes.success, `Approve failed: ${approveRes.message}`);

      assertEqual(approveRes.mrq.status, 'approved', 'mrq.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after approval');
      assertEqual(task.status, 'approved', 'task.status');

      const lastAction = task.history[task.history.length - 1].action;
      assertEqual(lastAction, 'approved', 'last history action');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  await test('Reject: MRQ status → rejected, task status → rejected', async () => {
    const submitCookie = await login('employee');
    const rejectCookie = await login('manager');

    const submitRes = await post('/api/material-requisitions', mrqBody(), submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: mrqId, taskId } = submitRes.mrq;

    try {
      const rejectRes = await put(`/api/material-requisitions/${mrqId}/reject`, { note: 'Test rejection' }, rejectCookie);
      assert(rejectRes.success, `Reject failed: ${rejectRes.message}`);

      assertEqual(rejectRes.mrq.status, 'rejected', 'mrq.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after rejection');
      assertEqual(task.status, 'rejected', 'task.status');

      const lastAction = task.history[task.history.length - 1].action;
      assertEqual(lastAction, 'rejected', 'last history action');
    } finally {
      cleanupRecord('material-requisitions.json', mrqId);
      if (taskId) cleanupTask(taskId);
    }
  });
}

module.exports = runMRQTests;
