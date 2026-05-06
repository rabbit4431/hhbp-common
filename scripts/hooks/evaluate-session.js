#!/usr/bin/env node
/**
 * Continuous Learning - Session Evaluator
 *
 * Stop hook that extracts reusable patterns from Claude Code sessions.
 * Reads transcript_path from stdin JSON (Claude Code hook input).
 *
 * Why Stop hook instead of UserPromptSubmit:
 * - Stop runs once at session end (lightweight)
 * - UserPromptSubmit runs every message (heavy, adds latency)
 */

const path = require('path');
const fs = require('fs');
const {
  getLearnedSkillsDir,
  ensureDir,
  readFile,
  countInFile,
  log
} = require('../lib/utils');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    stdinData += chunk.substring(0, MAX_STDIN - stdinData.length);
  }
});

process.stdin.on('end', () => {
  // Pass input through so the hook pipeline is not broken
  process.stdout.write(stdinData);
  main().catch(err => {
    process.stderr.write(`[ContinuousLearning] Error: ${err.message}\n`);
    process.exit(0);
  });
});

async function main() {
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinData);
    transcriptPath = input.transcript_path;
  } catch {
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  const scriptDir = __dirname;
  const configFile = path.join(scriptDir, '..', '..', 'skills', 'continuous-learning', 'config.json');

  let minSessionLength = 10;
  let learnedSkillsPath = getLearnedSkillsDir();

  const configContent = readFile(configFile);
  if (configContent) {
    try {
      const config = JSON.parse(configContent);
      minSessionLength = config.min_session_length ?? 10;
      if (config.learned_skills_path) {
        learnedSkillsPath = config.learned_skills_path.replace(/^~/, require('os').homedir());
      }
    } catch (err) {
      log(`[ContinuousLearning] Failed to parse config: ${err.message}, using defaults`);
    }
  }

  ensureDir(learnedSkillsPath);

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  const messageCount = countInFile(transcriptPath, /"type"\s*:\s*"user"/g);

  if (messageCount < minSessionLength) {
    log(`[ContinuousLearning] Session too short (${messageCount} messages), skipping`);
    process.exit(0);
  }

  log(`[ContinuousLearning] Session has ${messageCount} messages - evaluate for extractable patterns`);
  log(`[ContinuousLearning] Save learned skills to: ${learnedSkillsPath}`);

  process.exit(0);
}
