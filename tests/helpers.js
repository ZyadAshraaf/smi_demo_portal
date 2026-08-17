/**
 * Shared test helpers: login, HTTP requests, assertions, cleanup, test runner.
 * Requires Node 18+ (native fetch + FormData).
 * Tests run against a live server — start it before running.
 */

const fs   = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4046';

// ── Credentials ──────────────────────────────────────────────────────────────

const USERS = {
  employee: { email: 'sara@company.com',   password: 'demo123', id: 'u004', name: 'Sara Hassan' },
  manager:  { email: 'khalid@company.com', password: 'demo123', id: 'u002', name: 'Khalid Al-Mansouri' },
  ceo:      { email: 'ahmed@company.com',  password: 'demo123', id: 'u001', name: 'Ahmed Al-Rashidi' },
};

// ── Auth ──────────────────────────────────────────────────────────────────────

async function login(role) {
  const u = USERS[role];
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: u.email, password: u.password }),
  });

  // getSetCookie() returns an array (Node 18.14+); fallback to get() split
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=[^ ])/).filter(Boolean);

  if (!raw.length) throw new Error(`Login failed for ${role} — no Set-Cookie returned`);

  // Strip cookie attributes (Path, Expires, HttpOnly, SameSite…) — keep only name=value
  const cookie = raw.map(c => c.split(';')[0].trim()).join('; ');

  return cookie;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(path, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { cookie } });
  return res.json();
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function put(path, body, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function postForm(path, formData, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: { cookie },
    body:    formData,
  });
  return res.json();
}

// ── Assertion ─────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

// ── JSON data helpers ─────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../data');

function readData(file)       { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
function writeData(file, data){ fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); }

function cleanupRecord(file, id) {
  const data = readData(file);
  writeData(file, data.filter(r => r.id !== id));
}

function cleanupTask(taskId) {
  const tasks = readData('tasks.json');
  writeData('tasks.json', tasks.filter(t => t.id !== taskId));
}

function cleanupTasks(taskIds) {
  const tasks = readData('tasks.json');
  writeData('tasks.json', tasks.filter(t => !taskIds.includes(t.id)));
}

// ── Test runner ───────────────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
let _suite  = '';

function suite(name) {
  _suite = name;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('─'.repeat(60));
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    _passed++;
  } catch (err) {
    console.log(`  ✗  ${name}`);
    console.log(`     → ${err.message}`);
    _failed++;
  }
}

function summary() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Results: ${_passed} passed, ${_failed} failed`);
  console.log('═'.repeat(60));
  return _failed === 0;
}

module.exports = {
  BASE_URL, USERS,
  login, get, post, put, postForm,
  assert, assertEqual,
  readData, writeData, cleanupRecord, cleanupTask, cleanupTasks,
  suite, test, summary,
};
