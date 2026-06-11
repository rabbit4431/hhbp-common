'use strict';

const fs = require('fs');
const path = require('path');

const PACKAGE_MANAGERS = [
  { name: 'bun', lockfile: 'bun.lockb', config: 'bunfig.toml' },
  { name: 'pnpm', lockfile: 'pnpm-lock.yaml', config: '.pnpmfile.cjs' },
  { name: 'yarn', lockfile: 'yarn.lock', config: '.yarnrc.yml' },
  { name: 'npm', lockfile: 'package-lock.json', config: '.npmrc' },
];

function getPackageManager(cwd) {
  const dir = cwd || process.cwd();

  for (const pm of PACKAGE_MANAGERS) {
    if (fs.existsSync(path.join(dir, pm.lockfile))) {
      return { name: pm.name, source: pm.lockfile };
    }
  }

  for (const pm of PACKAGE_MANAGERS) {
    if (pm.config && fs.existsSync(path.join(dir, pm.config))) {
      return { name: pm.name, source: pm.config };
    }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (pkg.packageManager) {
      const match = String(pkg.packageManager).match(/^([a-z]+)/);
      if (match) {
        return { name: match[1], source: 'package.json#packageManager' };
      }
    }
  } catch {
    // no package.json or invalid JSON
  }

  return { name: 'npm', source: 'default' };
}

function getSelectionPrompt() {
  return [
    '[SessionStart] To set a package manager preference, add one of these lockfiles to your project:',
    '  bun      → bun.lockb',
    '  pnpm     → pnpm-lock.yaml',
    '  yarn     → yarn.lock',
    '  npm      → package-lock.json',
  ].join('\n');
}

module.exports = { getPackageManager, getSelectionPrompt };
