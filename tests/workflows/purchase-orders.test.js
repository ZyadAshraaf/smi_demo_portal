/**
 * Purchase Order (PO) Workflow Tests
 *
 * Covers:
 *   - Task assigned to correct approver per submitter role
 *   - CEO self-approval: task created and assigned to self
 *   - Approve path: PO status → approved, task status → approved
 *   - Reject  path: PO status → rejected, task status → rejected
 */

const { login, post, put, assert, assertEqual, USERS, readData, cleanupRecord, cleanupTask, suite, test } = require('../helpers');

const PO_BODY = {
  vendorId:         'V001',
  vendorName:       'Al Futtaim Office Solutions',
  deliveryLocation: 'Riyadh HQ',
  requiredBy:       '2026-06-30',
  costCenter:       'FIN-001',
  currency:         'AED',
  paymentTerms:     'Net 30',
  lineItems: [
    { item: 'A4 Paper', description: 'Test item', qty: 10, unit: 'Ream', unitPrice: 25, lineTotal: 250 },
  ],
  subtotal:      250,
  taxPct:        15,
  taxAmount:     37.50,
  grandTotal:    287.50,
  justification: '[TEST] PO workflow test',
};

async function runPOTests() {
  suite('Purchase Order (PO) Workflow');

  // ── Assignment tests ──────────────────────────────────────────────────────

  await test('Employee (Sara) submits → task assigned to Manager (Khalid)', async () => {
    const cookie = await login('employee');
    const res    = await post('/api/purchase-orders', PO_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: poId, taskId } = res.po;

    try {
      assert(taskId, 'No taskId on PO record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.manager.id, 'task.assignedTo');
    } finally {
      cleanupRecord('purchase-orders.json', poId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('Manager (Khalid) submits → task assigned to CEO (Ahmed)', async () => {
    const cookie = await login('manager');
    const res    = await post('/api/purchase-orders', PO_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: poId, taskId } = res.po;

    try {
      assert(taskId, 'No taskId on PO record');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('purchase-orders.json', poId);
      if (taskId) cleanupTask(taskId);
    }
  });

  await test('CEO (Ahmed) submits → task assigned to self (Ahmed)', async () => {
    const cookie = await login('ceo');
    const res    = await post('/api/purchase-orders', PO_BODY, cookie);

    assert(res.success, `Submit failed: ${res.message}`);
    const { id: poId, taskId } = res.po;

    try {
      assert(taskId, 'No taskId on PO record — CEO self-approval task not created');
      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupRecord('purchase-orders.json', poId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Approve path ──────────────────────────────────────────────────────────

  await test('Approve: PO status → approved, task status → approved', async () => {
    const submitCookie  = await login('employee');
    const approveCookie = await login('manager');

    const submitRes = await post('/api/purchase-orders', PO_BODY, submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: poId, taskId } = submitRes.po;

    try {
      const approveRes = await put(`/api/purchase-orders/${poId}/approve`, { note: 'Test approval' }, approveCookie);
      assert(approveRes.success, `Approve failed: ${approveRes.message}`);

      assertEqual(approveRes.po.status, 'approved', 'po.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after approval');
      assertEqual(task.status, 'approved', 'task.status');

      const lastAction = task.history[task.history.length - 1].action;
      assertEqual(lastAction, 'approved', 'last history action');
    } finally {
      cleanupRecord('purchase-orders.json', poId);
      if (taskId) cleanupTask(taskId);
    }
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  await test('Reject: PO status → rejected, task status → rejected', async () => {
    const submitCookie = await login('employee');
    const rejectCookie = await login('manager');

    const submitRes = await post('/api/purchase-orders', PO_BODY, submitCookie);
    assert(submitRes.success, `Submit failed: ${submitRes.message}`);
    const { id: poId, taskId } = submitRes.po;

    try {
      const rejectRes = await put(`/api/purchase-orders/${poId}/reject`, { note: 'Test rejection' }, rejectCookie);
      assert(rejectRes.success, `Reject failed: ${rejectRes.message}`);

      assertEqual(rejectRes.po.status, 'rejected', 'po.status');

      const task = readData('tasks.json').find(t => t.id === taskId);
      assert(task, 'Task not found after rejection');
      assertEqual(task.status, 'rejected', 'task.status');

      const lastAction = task.history[task.history.length - 1].action;
      assertEqual(lastAction, 'rejected', 'last history action');
    } finally {
      cleanupRecord('purchase-orders.json', poId);
      if (taskId) cleanupTask(taskId);
    }
  });
}

module.exports = runPOTests;
