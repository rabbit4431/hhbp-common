#!/usr/bin/env node
'use strict';

/**
 * PreToolUse hook: blocks dangerous Bash commands before they execute.
 *
 * Replaces the bash version to eliminate the bash/jq dependency,
 * ensuring the safety hook works on all platforms including Windows.
 *
 * Exit codes:
 *   0 = allow
 *   2 = deny (stderr is fed back to Claude)
 */

const fs = require('fs');

const raw = fs.readFileSync(0, 'utf8');

let command = '';
try {
  const input = JSON.parse(raw);
  command = (input.tool_input && input.tool_input.command) || '';
} catch {
  process.exit(0);
}

if (!command) {
  process.exit(0);
}

// Allowlist: targeted Java file removal (for unused class cleanup)
if (/^rm\s+[^-].*\.java$/.test(command)) {
  process.exit(0);
}

let reason = '';

// 1. Recursive force delete
if (/rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive|--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/.test(command)) {
  reason = 'Recursive force deletion (rm -rf) is blocked';
}

// 2. Dangerous SQL operations
if (!reason && /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i.test(command)) {
  reason = 'Destructive SQL operation is blocked';
}

// 3. Wiping build caches or entire directories
if (!reason && /rm\s+.*(\/\.m2\/|\/\.gradle\/|\/target\/\*|\/build\/\*)/.test(command)) {
  reason = 'Build cache/directory wipe is blocked';
}

// 4. Deletion of sensitive config files
if (!reason && /rm\s+.*\.(env|envrc|properties|yml|sql|pem|key|p12|jks)(\s|$)/.test(command)) {
  reason = 'Deletion of sensitive config/credential files is blocked';
}

// 5. Wildcard rm on non-.java files
if (!reason && /rm\s+.*\*/.test(command) && !/\*\.java(\s|$)/.test(command)) {
  reason = 'Wildcard deletion is blocked';
}

if (reason) {
  process.stderr.write(reason + '\n');
  const payload = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
  process.stdout.write(payload);
  process.exit(2);
}

process.exit(0);
