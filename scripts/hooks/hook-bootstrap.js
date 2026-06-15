#!/usr/bin/env node
'use strict';

/**
 * hook-bootstrap.js
 *
 * Generic bootstrap loader for hhbp hooks.
 *
 * Usage:
 *   node hook-bootstrap.js <hookId> <scriptRelativePath> <profilesCsv>
 *
 * Resolves the hhbp plugin root directory, then delegates to
 * run-with-flags.js with the given hook parameters. Reads raw JSON
 * from stdin and passes it through.
 *
 * This replaces the inline `node -e "..."` scripts that were previously
 * embedded in hooks.json for SessionEnd and Stop hooks.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CURRENT_PLUGIN_SLUG = 'hhbp';
const LEGACY_PLUGIN_SLUG = 'hhbp';
const KNOWN_PLUGIN_PATHS = [
  [CURRENT_PLUGIN_SLUG],
  [`${CURRENT_PLUGIN_SLUG}@${CURRENT_PLUGIN_SLUG}`],
  ['marketplace', CURRENT_PLUGIN_SLUG],
  [LEGACY_PLUGIN_SLUG],
  [`${LEGACY_PLUGIN_SLUG}@${LEGACY_PLUGIN_SLUG}`],
  ['marketplace', LEGACY_PLUGIN_SLUG],
];
const CACHE_PLUGIN_SLUGS = [CURRENT_PLUGIN_SLUG, LEGACY_PLUGIN_SLUG];

const REL_RUNNER = path.join('common', 'scripts', 'hooks', 'run-with-flags.js');

const raw = fs.readFileSync(0, 'utf8');

const [, , hookId, scriptRelPath, profilesCsv] = process.argv;

if (!hookId || !scriptRelPath) {
  process.stderr.write('[HookBootstrap] Missing hookId or scriptRelPath arguments\n');
  process.stdout.write(raw);
  process.exit(0);
}

function hasRunnerRoot(candidate) {
  const value = typeof candidate === 'string' ? candidate.trim() : '';
  return value.length > 0 && fs.existsSync(path.join(path.resolve(value), REL_RUNNER));
}

function resolvePluginRoot() {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
  if (hasRunnerRoot(envRoot)) {
    return path.resolve(envRoot.trim());
  }

  // Self-locate: this file lives at <root>/scripts/hooks/, so <root> is two
  // levels up. Works regardless of how the plugin is mounted (e.g. embedded at
  // <plugin>/common/) or which harness sets the env var.
  const selfRoot = path.resolve(__dirname, '..', '..');
  if (hasRunnerRoot(selfRoot)) {
    return selfRoot;
  }

  const home = require('os').homedir();
  const claudeDir = path.join(home, '.claude');

  if (hasRunnerRoot(claudeDir)) {
    return claudeDir;
  }

  const knownPaths = KNOWN_PLUGIN_PATHS.map((segments) =>
    path.join(claudeDir, 'plugins', ...segments)
  );

  for (const candidate of knownPaths) {
    if (hasRunnerRoot(candidate)) {
      return candidate;
    }
  }

  try {
    for (const slug of CACHE_PLUGIN_SLUGS) {
      const cacheBase = path.join(claudeDir, 'plugins', 'cache', slug);
      for (const org of fs.readdirSync(cacheBase, { withFileTypes: true })) {
        if (!org.isDirectory()) continue;
        for (const version of fs.readdirSync(path.join(cacheBase, org.name), { withFileTypes: true })) {
          if (!version.isDirectory()) continue;
          const candidate = path.join(cacheBase, org.name, version.name);
          if (hasRunnerRoot(candidate)) {
            return candidate;
          }
        }
      }
    }
  } catch {
    // cache directory may not exist
  }

  return claudeDir;
}

const root = resolvePluginRoot();
const script = path.join(root, REL_RUNNER);

if (fs.existsSync(script)) {
  const result = spawnSync(
    process.execPath,
    [script, hookId, scriptRelPath, profilesCsv || 'standard,strict'],
    {
      input: raw,
      encoding: 'utf8',
      env: process.env,
      cwd: process.cwd(),
      timeout: 30000,
    }
  );

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  if (stdout) {
    process.stdout.write(stdout);
  } else {
    process.stdout.write(raw);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error || result.status === null || result.signal) {
    const reason = result.error
      ? result.error.message
      : result.signal
        ? 'signal ' + result.signal
        : 'missing exit status';
    process.stderr.write(`[HookBootstrap] ERROR: hook runner failed for ${hookId}: ${reason}\n`);
    process.exit(1);
  }

  process.exit(Number.isInteger(result.status) ? result.status : 0);
}

process.stderr.write(
  `[HookBootstrap] WARNING: could not resolve hhbp plugin root for ${hookId}; skipping hook\n`
);
process.stdout.write(raw);
