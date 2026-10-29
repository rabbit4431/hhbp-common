#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MESSAGE = [
  '[git-workflow] Commit Timing: make one commit per feature — once the feature (or the change you were asked to make) is complete and verified, not after individual file edits. Include all of the feature\'s changes in that commit; `git add` new files first. If a skill you are following defines its own commit points (for example, one commit per TDD task), follow the skill.',
  '[git-workflow] Commit Format: <type>: <description>  (types: feat|fix|refactor|docs|test|chore|perf|ci)',
].join('\n');

function readPayload() {
  if (process.stdin.isTTY) return {};
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

// Claims the once-per-session-per-repo slot; false if this session already got the guidance.
function claimFirstNotice(sessionKey, repoRoot) {
  const dir = path.join(os.tmpdir(), 'hhbp-git-workflow');
  const name = crypto.createHash('sha1').update(`${sessionKey}\n${repoRoot}`).digest('hex');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), '', { flag: 'wx' });
    return true;
  } catch (err) {
    return err.code !== 'EEXIST';
  }
}

try {
  const payload = readPayload();
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const git = (args) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const repoRoot = git('rev-parse --show-toplevel').trim();
  if (git('status --porcelain').trim() === '') process.exit(0);
  // Without a session id, fall back to at most one notice per repo per hour.
  const sessionKey = payload.session_id || payload.transcript_path || `hour-${Math.floor(Date.now() / 3600000)}`;
  if (!claimFirstNotice(sessionKey, repoRoot)) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: MESSAGE
    }
  }));
} catch (_) {
  // not a git repo or git unavailable — silently exit
}
