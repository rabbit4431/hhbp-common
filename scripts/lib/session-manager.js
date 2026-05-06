/**
 * Session Manager for HHBP Claude Code sessions.
 * Sessions are stored as markdown .tmp files in ~/.claude/session-data/.
 */

const fs = require('fs');
const path = require('path');

const { getClaudeDir } = require('./utils');

function getSessionDir() {
  return path.join(getClaudeDir(), 'session-data');
}

function getLegacySessionDir() {
  return path.join(getClaudeDir(), 'sessions');
}

/**
 * Read all session files from the session directory.
 * Returns an array of { filename, sessionPath, shortId, date, modifiedTime }.
 */
function getAllSessions(options = {}) {
  const { limit = 50, date: filterDate = null, search = null } = options;

  const dirs = [getSessionDir(), getLegacySessionDir()].filter(d => {
    try { return fs.existsSync(d); } catch { return false; }
  });

  const seen = new Set();
  let sessions = [];

  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }

    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);

      const sessionPath = path.join(dir, f);
      let stat;
      try { stat = fs.statSync(sessionPath); } catch { continue; }
      if (!stat.isFile()) continue;

      // Extract date from filename (YYYY-MM-DD prefix); skip non-session files
      const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1];

      if (filterDate && date !== filterDate) continue;
      if (search && !f.toLowerCase().includes(search.toLowerCase())) continue;

      sessions.push({
        filename: f,
        sessionPath,
        shortId: 'no-id',
        date,
        modifiedTime: stat.mtime
      });
    }
  }

  // Sort newest first
  sessions.sort((a, b) => b.modifiedTime - a.modifiedTime);

  const total = sessions.length;
  if (limit > 0) sessions = sessions.slice(0, limit);

  return { sessions, total };
}

/**
 * Read raw content of a session file.
 */
function getSessionContent(sessionPath) {
  try {
    // sessionPath may be just a filename; try as-is, then in session dir
    if (fs.existsSync(sessionPath)) {
      return fs.readFileSync(sessionPath, 'utf8');
    }
    const candidate = path.join(getSessionDir(), sessionPath);
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse metadata from session file content.
 * Reads header lines of the form: **Field:** value
 */
function parseSessionMetadata(content) {
  if (!content) return {};

  const metadata = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Stop at the separator
    if (line.trim() === '---') break;

    const m = line.match(/^\*\*([^*:]+):\*\*\s*(.+)$/);
    if (!m) continue;

    const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = m[2].trim();

    switch (key) {
      case 'date':       metadata.date = value; break;
      case 'started':    metadata.started = value; break;
      case 'last_updated': metadata.lastUpdated = value; break;
      case 'project':    metadata.project = value; break;
      case 'branch':     metadata.branch = value; break;
      case 'worktree':   metadata.worktree = value; break;
      case 'title':      metadata.title = value; break;
    }
  }

  return metadata;
}

/**
 * Find a session by ID, date string, filename, or full path.
 * @param {string} id - Date (YYYY-MM-DD), filename, or full path
 * @param {boolean} withContent - Whether to parse metadata
 */
function getSessionById(id, withContent = false) {
  if (!id) return null;

  const dirs = [getSessionDir(), getLegacySessionDir()].filter(d => {
    try { return fs.existsSync(d); } catch { return false; }
  });

  // If it looks like an absolute path or a filename, try directly
  for (const dir of dirs) {
    // Try as full path
    if (fs.existsSync(id) && fs.statSync(id).isFile()) {
      return buildSession(id, path.basename(id), withContent);
    }
    // Try as filename inside dir
    const candidate = path.join(dir, id);
    if (fs.existsSync(candidate)) {
      return buildSession(candidate, id, withContent);
    }
  }

  // Try as date prefix match
  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    const match = files.find(f => f.startsWith(id));
    if (match) {
      const p = path.join(dir, match);
      return buildSession(p, match, withContent);
    }
  }

  return null;
}

function buildSession(sessionPath, filename, withContent) {
  let stat;
  try { stat = fs.statSync(sessionPath); } catch { return null; }

  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : 'unknown';

  const session = {
    filename,
    sessionPath,
    shortId: 'no-id',
    date,
    modifiedTime: stat.mtime,
    metadata: {}
  };

  if (withContent) {
    const content = getSessionContent(sessionPath);
    session.metadata = parseSessionMetadata(content);
  }

  return session;
}

/**
 * Count lines, checkboxes, etc. in a session file.
 */
function getSessionStats(sessionPath) {
  const content = getSessionContent(sessionPath);
  if (!content) return { lineCount: 0, totalItems: 0, completedItems: 0, inProgressItems: 0 };

  const lines = content.split('\n');
  const totalLines = lines.length;

  let totalItems = 0;
  let completedItems = 0;
  let inProgressItems = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [X]')) {
      totalItems++;
      completedItems++;
    } else if (trimmed.startsWith('- [ ]')) {
      totalItems++;
    } else if (trimmed.startsWith('-') && !trimmed.startsWith('- [')) {
      // Plain list items count as tasks
      if (trimmed.length > 2) {
        totalItems++;
        inProgressItems++;
      }
    }
  }

  return { lineCount: totalLines, totalItems, completedItems, inProgressItems };
}

/**
 * Human-readable file size.
 */
function getSessionSize(sessionPath) {
  try {
    const stat = fs.statSync(sessionPath);
    const bytes = stat.size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return '? B';
  }
}

module.exports = {
  getSessionDir,
  getLegacySessionDir,
  getAllSessions,
  getSessionContent,
  parseSessionMetadata,
  getSessionById,
  getSessionStats,
  getSessionSize
};
