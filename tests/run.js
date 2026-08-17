/**
 * Test runner — executes all workflow test suites in sequence.
 *
 * Usage:
 *   node tests/run.js                        # runs against http://localhost:4046
 *   TEST_BASE_URL=http://localhost:4046 node tests/run.js
 *
 * The server must be running before executing this script.
 * All created test records are cleaned up automatically after each test.
 */

const { summary, BASE_URL } = require('./helpers');

const runLeave   = require('./workflows/leave.test');
const runWfh     = require('./workflows/wfh.test');
const runTravel  = require('./workflows/travel.test');
const runPO      = require('./workflows/purchase-orders.test');
const runMRQ     = require('./workflows/material-requisitions.test');
const runEms     = require('./workflows/ems-versions.test');

(async () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Unified Workplace — Workflow Integration Tests');
  console.log(`  Target: ${BASE_URL}`);
  console.log('═'.repeat(60));

  try {
    await runLeave();
    await runWfh();
    await runTravel();
    await runPO();
    await runMRQ();
    await runEms();
  } catch (err) {
    console.error('\nUnexpected error:', err.message);
  }

  const allPassed = summary();
  process.exit(allPassed ? 0 : 1);
})();
