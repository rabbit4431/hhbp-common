#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook: tells the model which language to use for user-facing output.
 *
 * Prints nothing for English (the default), so behavior is unchanged unless a
 * language is selected. See lib/i18n.js for how the language is resolved.
 */

const { DEFAULT_LANGUAGE, resolveLanguage, translator } = require('./lib/i18n');

const code = resolveLanguage();
if (code === DEFAULT_LANGUAGE) process.exit(0);

const lang = translator(code)('language.name');

const DIRECTIVE = [
  `[hhbp-language] The user selected ${lang} (${code}) as their language.`,
  `- Reply to the user in ${lang}. Write plans, reviews, reports, notes, commit message descriptions, and code comments in ${lang}.`,
  '- Keep in English: code identifiers, file and branch names, shell commands, the commit `<type>:` prefix (feat|fix|refactor|docs|test|chore|perf|ci), and workflow protocol tokens — feature-state.json keys and values, REVIEW.md verdicts (PASS / BLOCK), and the fixed artifact file names other skills read.',
  `- When you dispatch a subagent, include this language instruction in its prompt; subagents do not see this message.`,
  `- Treat approvals and answers written in ${lang} the same as English ones.`,
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: DIRECTIVE,
  },
}));
