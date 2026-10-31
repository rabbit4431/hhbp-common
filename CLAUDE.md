# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Code Agent plugin** for Heshuo Harness Best Practices (HHBP) — providing development skills, specs, and safety hooks for Code Agent.

## Architecture

- **skills/** - Workflow definitions and domain knowledge (code generation, security review, etc.)
- **spec/** - Architecture and coding standards, and the feature-workflow design docs
- **scripts/hooks/** - Hook scripts (language, block-dangerous, git-workflow); `lib/i18n.js` + `locales/` for translated messages
- **hooks/hooks.json** - Hook registration (SessionStart: language; PreToolUse: block-dangerous; PostToolUse: git-workflow)
- **mcp/mcp.json** - MCP server configurations
- **lsp/lsp.json** - LSP server configurations (jdtls, pyright, typescript)

## Model tiers

Skills pin a Claude Code model per development phase via SKILL.md `model` frontmatter:

| Tier | `model` | Skills |
|---|---|---|
| design | `claude-opus-5-5` | service-discovery, contract-first-design, writing-implementation-plan, cross-service-review, code-review-request, security-review |
| impl | `claude-sonnet-5-5` | all other workflow, codegen, and test skills |

`sql-analyze` and `slow-sql-optimize` set no `model` and run on the session model. A new skill sets
`model` or omits it to inherit. Codex ignores `model` — there, every skill and subagent runs on the
session model.

## Language

Users pick an output language (`en`, `fr`, `de`). The `language.js` SessionStart hook resolves it —
`CLAUDE_PLUGIN_OPTION_LANGUAGE` (Claude Code `userConfig`), then `HHBP_LANGUAGE`, then
`~/.hhbp/config.json` (written by the `language-setup` skill), then `en` — and injects a directive
for any language other than English. Supported codes are the files in `scripts/hooks/locales/`.

Keep skills, agents, specs, and the directive itself in English; only user-facing output follows
the language. Never translate protocol tokens that skills parse: `feature-state.json` keys and
values, `REVIEW.md` verdicts, artifact file names, and the commit `<type>:` prefix.
