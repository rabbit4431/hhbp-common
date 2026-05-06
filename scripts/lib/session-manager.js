/**
 * Session Manager for HHBP Claude Code sessions.
 * Sessions are stored as markdown .tmp files in ~/.claude/session-data/.
 */

const fs = require('fs');
const path = require('path');

const { getClaudeDir, getSessionsDir, getSessionSearchDirs, readFile, log } = require('./utils');

// Session filename pattern: YYYY-MM-DD-[session-id]-session.tmp
// The session-id is optional (old format) and can include letters, digits,
// underscores, and hyphens, but must not start with a hyphen.
const SESSION_FILENAME_REGEX = /^(\d{4}-\d{2}-\d{2})(?:-([a-zA-Z0-9_][a-zA-Z0-9_-]*))?-session\.tmp$/;

/**
 * Parse session filename to extract date and short ID.
 * @param {string} filename
 * @returns {{ filename, shortId, date, datetime }|null}
 */
function parseSessionFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const match = filename.match(SESSION_FILENAME_REGEX);
  if (!match) return null;

  const dateStr = match[1];
  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject impossible dates (e.g. Feb 31) by checking roundtrip
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;

  return {
    filename,
    shortId: match[2] || 'no-id',
    date: dateStr,
    datetime: new Date(year, month - 1, day)
  };
}

/**
 * Read all session files from the session directory.
 * Returns { sessions, total, offset, limit, hasMore }.
 */
function getAllSessions(options = {}) {
  const { limit: rawLimit = 50, offset: rawOffset = 0, date: filterDate = null, search = null } = options;

  const offsetNum = Number(rawOffset);
  const offset = Number.isNaN(offsetNum) ? 0 : Math.max(0, Math.floor(offsetNum));
  const limitNum = Number(rawLimit);
  const limit = Number.isNaN(limitNum) ? 50 : Math.max(1, Math.floor(limitNum));

  const dirs = getSessionSearchDirs().filter(d => {
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

      const parsed = parseSessionFilename(f);
      if (!parsed) continue;

      if (filterDate && parsed.date !== filterDate) continue;
      if (search && !f.toLowerCase().includes(search.toLowerCase())) continue;

      sessions.push({
        filename: f,
        sessionPath,
        shortId: parsed.shortId,
        date: parsed.date,
        modifiedTime: stat.mtime
      });
    }
  }

  sessions.sort((a, b) => b.modifiedTime - a.modifiedTime);

  const total = sessions.length;
  const paged = sessions.slice(offset, offset + limit);

  return { sessions: paged, total, offset, limit, hasMore: offset + limit < total };
}

/**
 * Read raw content of a session file.
 */
function getSessionContent(sessionPath) {
  const content = readFile(sessionPath);
  if (content !== null) return content;

  // Fallback: try as filename in session dir
  const candidate = path.join(getSessionsDir(), sessionPath);
  return readFile(candidate);
}

/**
 * Parse metadata from session file content.
 */
function parseSessionMetadata(content) {
  if (!content) return {};

  const metadata = {};
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.trim() === '---') break;

    const m = line.match(/^\*\*([^*:]+):\*\*\s*(.+)$/);
    if (!m) continue;

    const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = m[2].trim();

    switch (key) {
      case 'date':         metadata.date = value; break;
      case 'started':      metadata.started = value; break;
      case 'last_updated': metadata.lastUpdated = value; break;
      case 'project':      metadata.project = value; break;
      case 'branch':       metadata.branch = value; break;
      case 'worktree':     metadata.worktree = value; break;
      case 'title':        metadata.title = value; break;
    }
  }

  return metadata;
}

/**
 * Find a session by ID, date string, filename, or full path.
 */
function getSessionById(id, withContent = false) {
  if (!id || typeof id !== 'string') return null;

  const normalizedId = id.trim();
  if (!normalizedId) return null;

  const dirs = getSessionSearchDirs().filter(d => {
    try { return fs.existsSync(d); } catch { return false; }
  });

  // Try as full path first
  if (fs.existsSync(normalizedId)) {
    try {
      if (fs.statSync(normalizedId).isFile()) {
        return buildSession(normalizedId, path.basename(normalizedId), withContent);
      }
    } catch { /* fall through */ }
  }

  const seenFilenames = new Set();

  for (const dir of dirs) {
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }

    for (const f of files) {
      if (seenFilenames.has(f)) continue;

      const parsed = parseSessionFilename(f);
      if (!parsed) {
        // Also try direct filename match for legacy files
        if (f === normalizedId || f === `${normalizedId}.tmp`) {
          seenFilenames.add(f);
          const p = path.join(dir, f);
          const s = buildSession(p, f, withContent);
          if (s) return s;
        }
        continue;
      }

      const shortIdMatch = parsed.shortId !== 'no-id' && parsed.shortId.startsWith(normalizedId);
      const filenameMatch = f === normalizedId || f === `${normalizedId}.tmp`;
      const dateMatch = parsed.date === normalizedId;
      const noIdMatch = parsed.shortId === 'no-id' && f === `${normalizedId}-session.tmp`;

      if (shortIdMatch || filenameMatch || dateMatch || noIdMatch) {
        seenFilenames.add(f);
        const p = path.join(dir, f);
        const s = buildSession(p, f, withContent);
        if (s) return s;
      }
    }
  }

  return null;
}

function buildSession(sessionPath, filename, withContent) {
  let stat;
  try { stat = fs.statSync(sessionPath); } catch { return null; }

  const parsed = parseSessionFilename(filename);
  const date = parsed ? parsed.date : (filename.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? 'unknown');
  const shortId = parsed ? parsed.shortId : 'no-id';

  const session = {
    filename,
    sessionPath,
    shortId,
    date,
    modifiedTime: stat.mtime,
    metadata: {}
  };

  if (withContent) {
    const content = getSessionContent(sessionPath);
    session.content = content;
    session.metadata = parseSessionMetadata(content);
    session.stats = getSessionStats(content || '');
  }

  return session;
}

/**
 * Count lines, checkboxes, etc. in a session file.
 * Accepts a file path or pre-read content string.
 */
function getSessionStats(sessionPathOrContent) {
  const looksLikePath = typeof sessionPathOrContent === 'string' &&
    !sessionPathOrContent.includes('\n') &&
    sessionPathOrContent.endsWith('.tmp') &&
    (sessionPathOrContent.startsWith('/') || /^[A-Za-z]:[/\\]/.test(sessionPathOrContent));
  const content = looksLikePath ? getSessionContent(sessionPathOrContent) : sessionPathOrContent;

  if (!content) return { lineCount: 0, totalItems: 0, completedItems: 0, inProgressItems: 0 };

  const lines = content.split('\n');
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
    } else if (trimmed.startsWith('-') && !trimmed.startsWith('- [') && trimmed.length > 2) {
      totalItems++;
      inProgressItems++;
    }
  }

  return { lineCount: lines.length, totalItems, completedItems, inProgressItems };
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

/**
 * Get session title from content.
 */
function getSessionTitle(sessionPath) {
  const content = getSessionContent(sessionPath);
  const metadata = parseSessionMetadata(content);
  return metadata.title || 'Untitled Session';
}

/**
 * Write session content to file.
 */
function writeSessionContent(sessionPath, content) {
  try {
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, content, 'utf8');
    return true;
  } catch (err) {
    log(`[SessionManager] Error writing session: ${err.message}`);
    return false;
  }
}

/**
 * Append content to a session file.
 */
function appendSessionContent(sessionPath, content) {
  try {
    fs.appendFileSync(sessionPath, content, 'utf8');
    return true;
  } catch (err) {
    log(`[SessionManager] Error appending to session: ${err.message}`);
    return false;
  }
}

/**
 * Delete a session file.
 */
function deleteSession(sessionPath) {
  try {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      return true;
    }
    return false;
  } catch (err) {
    log(`[SessionManager] Error deleting session: ${err.message}`);
    return false;
  }
}

/**
 * Check if a session file exists.
 */
function sessionExists(sessionPath) {
  try {
    return fs.statSync(sessionPath).isFile();
  } catch {
    return false;
  }
}

module.exports = {
  parseSessionFilename,
  getSessionDir: getSessionsDir,
  getLegacySessionDir: () => require('./utils').getLegacySessionsDir(),
  getAllSessions,
  getSessionContent,
  parseSessionMetadata,
  getSessionById,
  getSessionStats,
  getSessionSize,
  getSessionTitle,
  writeSessionContent,
  appendSessionContent,
  deleteSession,
  sessionExists
};
