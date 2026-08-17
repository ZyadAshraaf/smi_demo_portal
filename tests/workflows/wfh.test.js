/**
 * WFH Request Workflow Tests
 *
 * Covers:
 *   - Task assigned to correct approver per submitter role
 *   - Approve path: wfh status → approved, task status → approved
 *   - Reject  path: wfh status → rejected, task status → rejected
 */

const { login, post, put, assert, assertEqual, USERS, readData, cleanupRecord, cleanupTask, suite, test } = require('../helpers');

const WFH_BODY = {
  startDate: '2026-06-01',
  endDate:   '2026-06-02',
  days:      2,
  reason:    '[TEST] WFH workflow test',
};

async function runWfhTests() {
  suite('WFH Request Workflow');

  // ── Assignment tests ──────────────────────────────────────────────────────

  await test('Employee (Sara) submits → task assigned to Manager (Khalid)', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/wfh', WFH_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: wfhId, taskId } = res.wfh;

    try {
      assert(taskId, 'No taskId on wfh record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.manager.id, 'task.assignedTo');
    } finally {
      cleanupRecord('wfh.json', wfhId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Manager (Khalid) submits → task assigned to CEO (Ahmed)', async () => {
    const cookie = await login('manager');
    const res    = await post('/api/wfh', WFH_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: wfhId, taskId } = res.wfh;

    try {
      assert(taskId, 'No taskId on wfh record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('wfh.json', wfhId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('CEO (Ahmed) submits → task assigned to self (Ahmed)', async () => {
    const cookie = await login('ceo');
    const res    = await post('/api/wfh', WFH_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: wfhId, taskId } = res.wfh;

    try {
      assert(taskId, 'No taskId on wfh record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('wfh.json', wfhId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Approve path ──────────────────────────────────────────────────────────

  await test('Approve: wfh status → approved, task status → approved', async () => {
    const submitCookie  = await login('employee');
    const approveCookie = await login('manager');

    const submitRes = await post('/api/wfh', WFH_BODY, submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: wfhId, taskId } = submitRes.wfh;

    try {
      const approveRes = await put(`/api/wfh/${wfhId}`, { status: 'approved', note: 'Test approval' }, approveCookie);
      assert(approveRes.success, `Approve failed: ${approveRes.message}`);

      assertEqual(approveRes.wfh.status, 'approved', 'wfh.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after approval');
      assertEqual(task.status, 'approved', 'task.status');
    } finally {
      cleanupRecord('wfh.json', wfhId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  await test('Reject: wfh status → rejected, task status → rejected', async () => {
    const submitCookie = await login('employee');
    const rejectCookie = await login('manager');

    const submitRes = await post('/api/wfh', WFH_BODY, submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: wfhId, taskId } = submitRes.wfh;

    try {
      const rejectRes = await put(`/api/wfh/${wfhId}`, { status: 'rejected', note: 'Test rejection' }, rejectCookie);
      assert(rejectRes.success, `Reject failed: ${rejectRes.message}`);

      assertEqual(rejectRes.wfh.status, 'rejected', 'wfh.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after rejection');
      assertEqual(task.status, 'rejected', 'task.status');
    } finally {
      cleanupRecord('wfh.json', wfhId);
      if (taskId) cleanupTask(taskId);
    }
  });
}

module.exports = runWfhTests;
