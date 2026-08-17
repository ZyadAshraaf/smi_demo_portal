/**
 * Business Trip (Travel) Workflow Tests
 *
 * Covers:
 *   - Task assigned to correct approver per submitter role
 *   - Approve path: travel status → approved, task status → approved
 *   - Reject  path: travel status → rejected, task status → rejected
 *   - High-priority task when total cost > 10,000 SAR
 */

const { login, post, put, assert, assertEqual, USERS, readData, cleanupRecord, cleanupTask, suite, test } = require('../helpers');

function travelBody(totalCost = 5000) {
  return {
    destination:   'Dubai',
    origin:        'Riyadh',
    purpose:       '[TEST] Travel workflow test',
    departureDate: '2026-06-10',
    returnDate:    '2026-06-12',
    days:          3,
    travelers:     1,
    travelClass:   'economy',
    flight: {
      airline:     'Test Air',
      flightNo:    'TA-001',
      departure:   '08:00',
      arrival:     '10:00',
      price:       totalCost * 0.6,
    },
    hotel: {
      name:        'Test Hotel',
      checkIn:     '2026-06-10',
      checkOut:    '2026-06-12',
      nights:      2,
      pricePerNight: totalCost * 0.2,
      totalPrice:  totalCost * 0.4,
    },
    costBreakdown: {
      flight:  totalCost * 0.6,
      hotel:   totalCost * 0.4,
      total:   totalCost,
    },
  };
}

async function runTravelTests() {
  suite('Business Trip (Travel) Workflow');

  // ── Assignment tests ──────────────────────────────────────────────────────

  await test('Employee (Sara) submits → task assigned to Manager (Khalid)', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/travel', travelBody(), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: travelId, taskId } = res.travel;

    try {
      assert(taskId, 'No taskId on travel record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.manager.id, 'task.assignedTo');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Manager (Khalid) submits → task assigned to CEO (Ahmed)', async () => {
    const cookie = await login('manager');
    const res    = await post('/api/travel', travelBody(), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: travelId, taskId } = res.travel;

    try {
      assert(taskId, 'No taskId on travel record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('CEO (Ahmed) submits → task assigned to self (Ahmed)', async () => {
    const cookie = await login('ceo');
    const res    = await post('/api/travel', travelBody(), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: travelId, taskId } = res.travel;

    try {
      assert(taskId, 'No taskId on travel record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Cost > 10,000 SAR → task priority is "high"', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/travel', travelBody(15000), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: travelId, taskId } = res.travel;

    try {
      assert(taskId, 'No taskId on travel record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.priority, 'high', 'task.priority');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Cost ≤ 10,000 SAR → task priority is "medium"', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/travel', travelBody(5000), cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: travelId, taskId } = res.travel;

    try {
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.priority, 'medium', 'task.priority');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Approve path ──────────────────────────────────────────────────────────

  await test('Approve: travel status → approved, task status → approved', async () => {
    const submitCookie  = await login('employee');
    const approveCookie = await login('manager');

    const submitRes = await post('/api/travel', travelBody(), submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: travelId, taskId } = submitRes.travel;

    try {
      const approveRes = await put(`/api/travel/${travelId}`, { status: 'approved', note: 'Test approval' }, approveCookie);
      assert(approveRes.success, `Approve failed: ${approveRes.message}`);

      assertEqual(approveRes.travel.status, 'approved', 'travel.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after approval');
      assertEqual(task.status, 'approved', 'task.status');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  await test('Reject: travel status → rejected, task status → rejected', async () => {
    const submitCookie = await login('employee');
    const rejectCookie = await login('manager');

    const submitRes = await post('/api/travel', travelBody(), submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: travelId, taskId } = submitRes.travel;

    try {
      const rejectRes = await put(`/api/travel/${travelId}`, { status: 'rejected', note: 'Test rejection' }, rejectCookie);
      assert(rejectRes.success, `Reject failed: ${rejectRes.message}`);

      assertEqual(rejectRes.travel.status, 'rejected', 'travel.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after rejection');
      assertEqual(task.status, 'rejected', 'task.status');
    } finally {
      cleanupRecord('travel.json', travelId);
      if (taskId) cleanupTask(taskId);
    }
  });
}

module.exports = runTravelTests;
