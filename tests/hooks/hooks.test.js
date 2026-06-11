/**
 * Tests for hook scripts
 *
 * Run with: node tests/hooks/hooks.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function getCanonicalSessionsDir(homeDir) {
  return path.join(homeDir, '.claude', 'session-data');
}

function getLegacySessionsDir(homeDir) {
  return path.join(homeDir, '.claude', 'sessions');
}

function getSessionStartAdditionalContext(stdout) {
  assert.ok(stdout.trim(), 'Expected SessionStart hook to emit stdout payload');
  const payload = JSON.parse(stdout);
  assert.strictEqual(payload.hookSpecificOutput?.hookEventName, 'SessionStart', 'Should emit SessionStart hook payload');
  assert.strictEqual(typeof payload.hookSpecificOutput?.additionalContext, 'string', 'Should include additionalContext text');
  return payload.hookSpecificOutput.additionalContext;
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runScript(scriptPath, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => (stdout += data));
    proc.stderr.on('data', data => (stderr += data));

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

async function runTests() {
  console.log('\n=== Testing Hook Scripts ===\n');

  let passed = 0;
  let failed = 0;

  const scriptsDir = path.join(__dirname, '..', '..', 'scripts', 'hooks');

  // session-start.js tests
  console.log('session-start.js:');

  if (
    await asyncTest('runs without error', async () => {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'));
      assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('outputs session info to stderr', async () => {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'));
      assert.ok(result.stderr.includes('[SessionStart]') || result.stderr.includes('Package manager'), 'Should output session info');
    })
  )
    passed++;
  else failed++;

  // session-start.js edge cases
  console.log('\nsession-start.js (edge cases):');

  if (
    await asyncTest('exits 0 even with isolated empty HOME', async () => {
      const isoHome = path.join(os.tmpdir(), `hhbp-iso-start-${Date.now()}`);
      fs.mkdirSync(getCanonicalSessionsDir(isoHome), { recursive: true });
      fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });
      try {
        const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
          HOME: isoHome,
          USERPROFILE: isoHome
        });
        assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
      } finally {
        fs.rmSync(isoHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('reports package manager detection', async () => {
      const result = await runScript(path.join(scriptsDir, 'session-start.js'));
      assert.ok(result.stderr.includes('Package manager') || result.stderr.includes('[SessionStart]'), 'Should report package manager info');
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('skips template session content', async () => {
      const isoHome = path.join(os.tmpdir(), `hhbp-tpl-start-${Date.now()}`);
      const sessionsDir = getLegacySessionsDir(isoHome);
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

      const sessionFile = path.join(sessionsDir, '2026-02-11-abcd1234-session.tmp');
      fs.writeFileSync(sessionFile, '## Current State\n\n[Session context goes here]\n');

      try {
        const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
          HOME: isoHome,
          USERPROFILE: isoHome
        });
        assert.strictEqual(result.code, 0);
        const additionalContext = getSessionStartAdditionalContext(result.stdout);
        assert.ok(!additionalContext.includes('Previous session summary'), 'Should not inject template session content');
      } finally {
        fs.rmSync(isoHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('injects real session content', async () => {
      const isoHome = path.join(os.tmpdir(), `hhbp-real-start-${Date.now()}`);
      const sessionsDir = getLegacySessionsDir(isoHome);
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.mkdirSync(getCanonicalSessionsDir(isoHome), { recursive: true });
      fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

      const sessionFile = path.join(sessionsDir, '2026-02-11-efgh5678-session.tmp');
      fs.writeFileSync(sessionFile, '# Real Session\n\nI worked on authentication refactor.\n');

      try {
        const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
          HOME: isoHome,
          USERPROFILE: isoHome
        });
        assert.strictEqual(result.code, 0);
        const additionalContext = getSessionStartAdditionalContext(result.stdout);
        assert.ok(additionalContext.includes('PRIOR-SESSION SUMMARY'), 'Should inject real session content');
        assert.ok(additionalContext.includes('authentication refactor'), 'Should include session content text');
      } finally {
        fs.rmSync(isoHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('prefers canonical session-data content over legacy duplicates', async () => {
      const isoHome = path.join(os.tmpdir(), `hhbp-canonical-start-${Date.now()}`);
      const canonicalDir = getCanonicalSessionsDir(isoHome);
      const legacyDir = getLegacySessionsDir(isoHome);
      const now = new Date();
      const filename = `${now.toISOString().slice(0, 10)}-dupe1234-session.tmp`;
      const canonicalFile = path.join(canonicalDir, filename);
      const legacyFile = path.join(legacyDir, filename);
      const canonicalTime = new Date(now.getTime() - 60 * 1000);
      const legacyTime = new Date(canonicalTime.getTime());

      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

      fs.writeFileSync(canonicalFile, '# Canonical Session\n\nUse the canonical session-data copy.\n');
      fs.writeFileSync(legacyFile, '# Legacy Session\n\nDo not prefer the legacy duplicate.\n');
      fs.utimesSync(canonicalFile, canonicalTime, canonicalTime);
      fs.utimesSync(legacyFile, legacyTime, legacyTime);

      try {
        const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
          HOME: isoHome,
          USERPROFILE: isoHome
        });
        assert.strictEqual(result.code, 0);
        const additionalContext = getSessionStartAdditionalContext(result.stdout);
        assert.ok(additionalContext.includes('canonical session-data copy'));
        assert.ok(!additionalContext.includes('legacy duplicate'));
      } finally {
        fs.rmSync(isoHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('strips ANSI escape codes from injected session content', async () => {
      const isoHome = path.join(os.tmpdir(), `hhbp-ansi-start-${Date.now()}`);
      const sessionsDir = getLegacySessionsDir(isoHome);
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.mkdirSync(getCanonicalSessionsDir(isoHome), { recursive: true });
      fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

      const sessionFile = path.join(sessionsDir, '2026-02-11-winansi00-session.tmp');
      fs.writeFileSync(
        sessionFile,
        '\x1b[H\x1b[2J\x1b[3J# Real Session\n\nI worked on \x1b[1;36mWindows terminal handling\x1b[0m.\x1b[K\n'
      );

      try {
        const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
          HOME: isoHome,
          USERPROFILE: isoHome
        });
        assert.strictEqual(result.code, 0);
        const additionalContext = getSessionStartAdditionalContext(result.stdout);
        assert.ok(additionalContext.includes('PRIOR-SESSION SUMMARY'), 'Should inject real session content');
        assert.ok(additionalContext.includes('Windows terminal handling'), 'Should preserve sanitized session text');
        assert.ok(!additionalContext.includes('\x1b['), 'Should not emit ANSI escape codes');
      } finally {
        fs.rmSync(isoHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    await asyncTest('reports learned skills count', async () => {
      const isoHome = path.join(os.tmpdir(), `hhbp-skills-start-${Date.now()}`);
      const learnedDir = path.join(isoHome, '.claude', 'skills', 'learned');
      fs.mkdirSync(learnedDir, { recursive: true });
      fs.mkdirSync(getCanonicalSessionsDir(isoHome), { recursive: true });

      fs.writeFileSync(path.join(learnedDir, 'testing-patterns.md'), '# Testing');
      fs.writeFileSync(path.join(learnedDir, 'debugging.md'), '# Debugging');

      try {
        const result = await runScript(path.join(scriptsDir, 'session-start.js'), '', {
          HOME: isoHome,
          USERPROFILE: isoHome
        });
        assert.strictEqual(result.code, 0);
        assert.ok(result.stderr.includes('2 learned skill(s)'), `Should report 2 learned skills, stderr: ${result.stderr}`);
      } finally {
        fs.rmSync(isoHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
