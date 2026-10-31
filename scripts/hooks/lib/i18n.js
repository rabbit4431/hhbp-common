'use strict';

/**
 * Language resolution and message lookup for hook scripts.
 *
 * Resolution order (first valid code wins):
 *   1. CLAUDE_PLUGIN_OPTION_LANGUAGE — Claude Code plugin userConfig `language`
 *   2. HHBP_LANGUAGE                 — manual override (any harness)
 *   3. ~/.hhbp/config.json `language` — written by the language-setup skill (Codex)
 *   4. 'en'
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const DEFAULT_LANGUAGE = 'en';

// Extra spellings (lower-case) mapped to a supported code.
const ALIASES = {};

function supportedLanguages() {
  return fs.readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
}

// Maps user input (any case, '_' or '-') to a supported code, or null.
// A region variant with no locale of its own (de-AT, fr_CA) falls back to its base language.
function normalize(code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  const key = code.trim().replace(/_/g, '-').toLowerCase();
  const find = (k) => supportedLanguages().find((c) => c.toLowerCase() === k) || ALIASES[k] || null;
  return find(key) || find(key.split('-')[0]);
}

function readConfigLanguage() {
  try {
    const file = path.join(os.homedir(), '.hhbp', 'config.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).language;
  } catch (_) {
    return null;
  }
}

function resolveLanguage() {
  return normalize(process.env.CLAUDE_PLUGIN_OPTION_LANGUAGE)
    || normalize(process.env.HHBP_LANGUAGE)
    || normalize(readConfigLanguage())
    || DEFAULT_LANGUAGE;
}

function loadLocale(code) {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'));
  } catch (_) {
    return {};
  }
}

// Returns a translator for `code`; missing keys fall back to English, then to the key itself.
function translator(code = resolveLanguage()) {
  const locale = loadLocale(code);
  const fallback = code === DEFAULT_LANGUAGE ? locale : loadLocale(DEFAULT_LANGUAGE);
  return (key) => locale[key] || fallback[key] || key;
}

module.exports = { DEFAULT_LANGUAGE, normalize, resolveLanguage, translator };
