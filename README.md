# hhbp-claude-code

Heshuo Harness Best Practices — Claude Code plugin providing DDD-standard hooks, agents, skills, and session lifecycle automation for Java Maven microservices development.

## Overview

`hhbp-claude-code` is a [Claude Code](https://claude.ai/code) plugin that enforces production-grade engineering practices across your development sessions. It brings together:

- **Session continuity** — automatically loads prior context on every new session and persists session state on exit
- **Automated code quality** — formats Java files on save and enforces git commit conventions
- **Domain-driven skills** — ready-made workflows for code generation, SQL analysis, API scaffolding, and security review aligned with DDD architecture

Repository: <https://github.com/rabbit4431/hhbp-claude-code>

## Features

- **5 session lifecycle hooks** — SessionStart, PreToolUse, PostToolUse, SessionEnd, and Stop events wired to purpose-built scripts
- **7 domain skills** — `/generate-code`, `/generate-api`, `/sql-analyze`, `/slow-sql-optimize`, `/remove-unused-class`, `/security-review`, `/docs-lookup`
- **6 specialized subagents** — planner, java-reviewer, java-build-resolver, security-reviewer, sql-performance-reviewer, docs-lookup
- **`/sessions` slash command** — browse, alias, and restore past Claude Code sessions
- **MCP configuration** — pre-configured MCP server settings in `mcp-configs/`
- **Development standards** — DDD architecture spec and backend development standards in `spec/`

## Directory Structure

```
hhbp-common/
├── hooks/
│   └── hooks.json              # Claude Code hook registrations (SessionStart / PreToolUse / PostToolUse / SessionEnd / Stop)
├── commands/
│   └── sessions.md             # /sessions slash command definition
├── agents/                     # Subagent definitions (planner, java-reviewer, security-reviewer, …)
├── skills/                     # Skill definitions (generate-code, generate-api, sql-analyze, …)
├── scripts/
│   ├── hooks/                  # Session lifecycle JS scripts (session-start, session-end, block-dangerous, activity-tracker, …)
│   └── lib/                    # Shared utility library (package-manager, project-detect)
├── mcp-configs/                # MCP server configuration (mcp.json)
├── spec/                       # Architecture and coding standards docs
├── schemas/                    # JSON schemas for validation
└── tests/
    └── hooks/
        └── hooks.test.js       # Hook script test suite
```

## Installation

```
/plugin marketplace add rabbit4431/hhbp-claude-code

/plugin install hhbp-claude-code@hhbp-claude-code
```

## Hooks Reference

| Event | Matcher | Script | Purpose |
|---|---|---|---|
| SessionStart | `*` | `session-start-bootstrap.js` | Load previous context and detect package manager |
| PreToolUse | `Bash` | `block-dangerous.js` | Block dangerous shell commands before execution |
| PostToolUse | `Write\|Edit\|MultiEdit` | `git-workflow.js` | Enforce commit timing and format rules |
| PostToolUse | `*` | `session-activity-tracker.js` | Record per-tool activity metrics (async) |
| SessionEnd | `*` | `session-end-marker.js` | Write session end marker (non-blocking, async) |
| Stop | `*` | `session-end.js` | Persist session state after each response |
