/**
 * EMS New Document Version Workflow Tests
 *
 * Covers:
 *   - Task assigned to correct approver per submitter role (managerId chain)
 *   - Approve path: version status → "approved", currentVersion bumped, task → approved
 *   - Reject  path: version entry removed, file deleted, task → rejected
 *
 * Uses document DOC1A2B3C01 (always exists in seed data).
 * Each test cleans up after itself via direct JSON + file manipulation.
 */

const fs   = require('fs');
const path = require('path');
const { login, postForm, assert, assertEqual, USERS, readData, writeData, cleanupTask, suite, test } = require('../helpers');

const DOC_ID     = 'DOC1A2B3C01';
const DOCS_FILE  = 'ems-documents.json';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/ems');

// Minimal valid single-page PDF as a Buffer
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
  'xref\n0 4\n' +
  '0000000000 65535 f \n' +
  '0000000009 00000 n \n' +
  '0000000058 00000 n \n' +
  '0000000115 00000 n \n' +
  'trailer<</Size 4/Root 1 0 R>>\n' +
  'startxref\n190\n%%EOF\n'
);

function getDocCurrentVersion() {
  const docs = readData(DOCS_FILE);
  const doc  = docs.find(d => d.id === DOC_ID);
  return doc ? doc.currentVersion : null;
}

function cleanupVersion(version, taskId) {
  const docs  = readData(DOCS_FILE);
  const dIdx  = docs.findIndex(d => d.id === DOC_ID);
  if (dIdx === -1) return;

  const doc    = docs[dIdx];
  const vIdx   = doc.versions.findIndex(v => v.version === version);
  if (vIdx !== -1) {
    const storagePath = path.join(__dirname, '../../', doc.versions[vIdx].storagePath);
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    doc.versions.splice(vIdx, 1);
  }
  // Reset currentVersion if it was bumped to this version
  if (doc.currentVersion === version) doc.currentVersion = version - 1;
  doc.updatedAt = new Date().toISOString();
  writeData(DOCS_FILE, docs);

  if (taskId) cleanupTask(taskId);
}

async function uploadVersion(cookie) {
  const form = new FormData();
  form.append('notes', '[TEST] EMS version workflow test');
  form.append('file', new Blob([MINIMAL_PDF], { type: 'application/pdf' }), 'test-version.pdf');
  const res = await postForm(`/api/ems/documents/${DOC_ID}/versions`, form, cookie);
  return res;
}

function resetDocState() {
  // Remove any leftover pending versions and their files from a previous crashed run
  const docs = readData(DOCS_FILE);
  const dIdx = docs.findIndex(d => d.id === DOC_ID);
  if (dIdx === -1) return;
  const doc = docs[dIdx];
  doc.versions.filter(v => v.status === 'pending').forEach(v => {
    const fp = path.join(__dirname, '../../', v.storagePath);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  doc.versions = doc.versions.filter(v => v.status !== 'pending');
  writeData(DOCS_FILE, docs);

  // Remove any orphaned pending EMS tasks for this doc
  const tasks = readData('tasks.json');
  writeData('tasks.json', tasks.filter(t => !(t.sourceSystem === 'EMS' && t.status === 'pending' && t.metadata?.docId === DOC_ID)));
}

async function runEmsVersionTests() {
  suite('EMS New Document Version Workflow');

  resetDocState();
  const baseVersion = getDocCurrentVersion();

  // ── Assignment tests ──────────────────────────────────────────────────────

  await test('Employee (Sara) uploads → task assigned to Manager (Khalid)', async () => {
    const cookie = await login('employee');
    const res    = await uploadVersion(cookie);

    assert(res.success, `Upload failed: ${res.message}`);
    const uploadedVersion = baseVersion + 1;

    const tasks   = readData('tasks.json');
    const task    = tasks.find(t => t.metadata?.docId === DOC_ID && t.metadata?.version === uploadedVersion);

    try {
      assert(task, 'Approval task not found');
      assertEqual(task.assignedTo, USERS.manager.id, 'task.assignedTo');
    } finally {
      cleanupVersion(uploadedVersion, task?.id);
    }
  });

  await test('Manager (Khalid) uploads → task assigned to CEO (Ahmed)', async () => {
    const cookie = await login('manager');
    const res    = await uploadVersion(cookie);

    assert(res.success, `Upload failed: ${res.message}`);
    const uploadedVersion = baseVersion + 1;

    const tasks = readData('tasks.json');
    const task  = tasks.find(t => t.metadata?.docId === DOC_ID && t.metadata?.version === uploadedVersion);

    try {
      assert(task, 'Approval task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupVersion(uploadedVersion, task?.id);
    }
  });

  await test('CEO (Ahmed) uploads → task assigned to self (Ahmed)', async () => {
    const cookie = await login('ceo');
    const res    = await uploadVersion(cookie);

    assert(res.success, `Upload failed: ${res.message}`);
    const uploadedVersion = baseVersion + 1;

    const tasks = readData('tasks.json');
    const task  = tasks.find(t => t.metadata?.docId === DOC_ID && t.metadata?.version === uploadedVersion);

    try {
      assert(task, 'Approval task not found');
      assertEqual(task.assignedTo, USERS.ceo.id, 'task.assignedTo');
    } finally {
      cleanupVersion(uploadedVersion, task?.id);
    }
  });

  // ── Approve path ──────────────────────────────────────────────────────────

  await test('Approve: version status → approved, currentVersion bumped, task → approved', async () => {
    const uploadCookie  = await login('employee');
    const approveCookie = await login('manager');

    const uploadRes = await uploadVersion(uploadCookie);
    assert(uploadRes.success, `Upload failed: ${uploadRes.message}`);
    const uploadedVersion = baseVersion + 1;

    const tasks  = readData('tasks.json');
    const task   = tasks.find(t => t.metadata?.docId === DOC_ID && t.metadata?.version === uploadedVersion);
    assert(task, 'Approval task not found before approve');

    try {
      const { post } = require('../helpers');
      const approveRes = await post(`/api/ems/documents/${DOC_ID}/versions/${uploadedVersion}/approve`, {}, approveCookie);
      assert(approveRes.success, `Approve failed: ${approveRes.message}`);

      // Version status is 'approved' and currentVersion bumped
      const docs = readData(DOCS_FILE);
      const doc  = docs.find(d => d.id === DOC_ID);
      assertEqual(doc.currentVersion, uploadedVersion, 'doc.currentVersion');

      const ver = doc.versions.find(v => v.version === uploadedVersion);
      assert(ver, 'Version entry not found after approval');
      assertEqual(ver.status, 'approved', 'version.status');

      // Task status is 'approved'
      const updatedTask = readData('tasks.json').find(t => t.id === task.id);
      assertEqual(updatedTask.status, 'approved', 'task.status');
    } finally {
      cleanupVersion(uploadedVersion, task?.id);
    }
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  await test('Reject: version entry removed, file deleted, task → rejected', async () => {
    const uploadCookie = await login('employee');
    const rejectCookie = await login('manager');

    const uploadRes = await uploadVersion(uploadCookie);
    assert(uploadRes.success, `Upload failed: ${uploadRes.message}`);
    const uploadedVersion = baseVersion + 1;

    const tasks  = readData('tasks.json');
    const task   = tasks.find(t => t.metadata?.docId === DOC_ID && t.metadata?.version === uploadedVersion);
    const storagePath = path.join(UPLOAD_DIR, `${DOC_ID}_v${uploadedVersion}.pdf`);
    assert(task, 'Approval task not found before reject');

    try {
      const { post } = require('../helpers');
      const rejectRes = await post(`/api/ems/documents/${DOC_ID}/versions/${uploadedVersion}/reject`, {}, rejectCookie);
      assert(rejectRes.success, `Reject failed: ${rejectRes.message}`);

      // Version entry should be gone
      const doc = readData(DOCS_FILE).find(d => d.id === DOC_ID);
      const ver = doc.versions.find(v => v.version === uploadedVersion);
      assert(!ver, 'Version entry still exists after rejection — should have been removed');

      // Physical file should be deleted
      assert(!fs.existsSync(storagePath), 'File still exists on disk after rejection');

      // currentVersion should not have changed
      assertEqual(doc.currentVersion, baseVersion, 'doc.currentVersion should not change on reject');

      // Task status should be 'rejected'
      const updatedTask = readData('tasks.json').find(t => t.id === task.id);
      assertEqual(updatedTask.status, 'rejected', 'task.status');
    } finally {
      // Reject auto-cleans the version and file; only clean up the task if somehow still pending
      const leftoverTask = readData('tasks.json').find(t => t.id === task?.id && t.status === 'pending');
      if (leftoverTask) cleanupTask(leftoverTask.id);
    }
  });

  await test('Cannot upload second version while one is pending', async () => {
    const cookie = await login('employee');

    const first = await uploadVersion(cookie);
    assert(first.success, `First upload failed: ${first.message}`);
    const uploadedVersion = baseVersion + 1;
    const tasks  = readData('tasks.json');
    const task   = tasks.find(t => t.metadata?.docId === DOC_ID && t.metadata?.version === uploadedVersion);

    try {
      const second = await uploadVersion(cookie);
      assert(!second.success, 'Second upload should have been blocked');
    } finally {
      cleanupVersion(uploadedVersion, task?.id);
    }
  });
}

module.exports = runEmsVersionTests;
