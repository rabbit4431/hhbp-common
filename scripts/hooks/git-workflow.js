#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  const lines = status.trim().split('\n').filter(Boolean);
  const untracked = lines.filter(l => l.startsWith('??'));
  const tracked = lines.filter(l => !l.startsWith('??'));
  if (lines.length > 0) {
    const parts = [
      '[git-workflow] Commit Timing: stage and commit after each modification.',
      '[git-workflow] Commit Format: <type>: <description>  (types: feat|fix|refactor|docs|test|chore|perf|ci)',
    ];
    if (tracked.length > 0) parts.push(`[git-workflow] ${tracked.length} tracked file(s) have uncommitted changes — commit directly.`);
    if (untracked.length > 0) parts.push(`[git-workflow] ${untracked.length} untracked file(s) — run \`git add\` first, then commit.`);
    const msg = parts.join('\n');
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: msg
      }
    }));
  }
} catch (_) {
  // not a git repo or git unavailable — silently exit
}
