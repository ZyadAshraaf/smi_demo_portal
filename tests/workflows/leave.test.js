/**
 * Leave Request Workflow Tests
 *
 * Covers:
 *   - Task assigned to correct approver per submitter role
 *   - Approve path: leave status → approved, task status → approved
 *   - Reject  path: leave status → rejected, task status → rejected
 */

const { login, post, put, get, assert, assertEqual, USERS, readData, cleanupRecord, cleanupTask, suite, test } = require('../helpers');

const LEAVE_BODY = {
  type:      'annual',
  startDate: '2026-06-01',
  endDate:   '2026-06-03',
  days:      3,
  reason:    '[TEST] Leave workflow test',
};

async function runLeaveTests() {
  suite('Leave Request Workflow');

  // ── Assignment tests ──────────────────────────────────────────────────────

  await test('Employee (Sara) submits → task assigned to Manager (Khalid)', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/leaves', LEAVE_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: leaveId, taskId } = res.leave;

    try {
      assert(taskId, 'No taskId on leave record');
      const tasks = readData('tasks.json');
      const task  = tasks.find(t => t.id === taskId);
      assert(task, 'Task not found in tasks.json');
      assertEqual(task.assignedTo, USERS.manager.id, 'task.assignedTo');
    } finally {
      cleanupRecord('leaves.json', leaveId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Manager (Khalid) submits → task assigned to CEO (Ahmed)', async () => {
    const cookie = await login('manager');
    const res    = await post('/api/leaves', LEAVE_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: leaveId, taskId } = res.leave;

    try {
      assert(taskId, 'No taskId on leave record');
      const tasks = readData('tasks.json');
      const task  = tasks.find(t => t.id === taskId);
      assert(task, 'Task not found in tasks.json');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('leaves.json', leaveId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('CEO (Ahmed) submits → task assigned to self (Ahmed)', async () => {
    const cookie = await login('ceo');
    const res    = await post('/api/leaves', LEAVE_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: leaveId, taskId } = res.leave;

    try {
      assert(taskId, 'No taskId on leave record');
      const tasks = readData('tasks.json');
      const task  = tasks.find(t => t.id === taskId);
      assert(task, 'Task not found in tasks.json');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('leaves.json', leaveId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Approve path ──────────────────────────────────────────────────────────

  await test('Approve: leave status → approved, task status → approved', async () => {
    const submitCookie  = await login('employee');
    const approveCookie = await login('manager');

    const submitRes = await post('/api/leaves', LEAVE_BODY, submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: leaveId, taskId } = submitRes.leave;

    try {
      const approveRes = await put(`/api/leaves/${leaveId}`, { status: 'approved', note: 'Test approval' }, approveCookie);
      assert(approveRes.success, `Approve failed: ${approveRes.message}`);

      assertEqual(approveRes.leave.status, 'approved', 'leave.status');

      const tasks = readData('tasks.json');
      const task  = tasks.find(t => t.id === taskId);
      assert(task, 'Task not found after approval');
      assertEqual(task.status, 'approved', 'task.status');

      const lastAction = task.history[task.history.length - 1].action;
      assertEqual(lastAction, 'approved', 'last history action');
    } finally {
      cleanupRecord('leaves.json', leaveId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  await test('Reject: leave status → rejected, task status → rejected', async () => {
    const submitCookie  = await login('employee');
    const rejectCookie  = await login('manager');

    const submitRes = await post('/api/leaves', LEAVE_BODY, submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: leaveId, taskId } = submitRes.leave;

    try {
      const rejectRes = await put(`/api/leaves/${leaveId}`, { status: 'rejected', note: 'Test rejection' }, rejectCookie);
      assert(rejectRes.success, `Reject failed: ${rejectRes.message}`);

      assertEqual(rejectRes.leave.status, 'rejected', 'leave.status');

      const tasks = readData('tasks.json');
      const task  = tasks.find(t => t.id === taskId);
      assert(task, 'Task not found after rejection');
      assertEqual(task.status, 'rejected', 'task.status');

      const lastAction = task.history[task.history.length - 1].action;
      assertEqual(lastAction, 'rejected', 'last history action');
    } finally {
      cleanupRecord('leaves.json', leaveId);
      if (taskId) cleanupTask(taskId);
    }
  });
}

module.exports = runLeaveTests;
