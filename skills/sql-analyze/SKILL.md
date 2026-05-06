---
description: >
  Analyzes MyBatis Plus SELECT queries for performance issues against production-scale data
  (500k+ rows). Accepts a file path (single-file mode), a directory path (batch mode), or no
  argument (git-diff mode: changed mapper files on the current branch). Delegates all analysis
  to the sql-performance-reviewer subagent which runs EXPLAIN via MCP.
allowed-tools: Bash, Glob, Grep
---

# SQL Performance Analysis

Determine the scope from `$ARGUMENTS`, then spawn the `hhbp:sql-performance-reviewer` subagent.
Do not perform any analysis yourself — the agent owns all logic.
Do not hardcode a target database or MCP server — the agent selects them per its own Step 2 workflow.

## Scope Detection

| `$ARGUMENTS` value | Mode | What to pass to the agent |
|--------------------|------|---------------------------|
| `<path>#<name>` (e.g. `OrderMapper.xml#findByOrderNo`) | Single method | The full `file#selector` string as-is |
| A file path (`*Mapper.xml`, `*Mapper.java`, `*ServiceImpl.java`) | Single-file | That file path |
| A directory path | Batch | That directory path |
| Empty / not provided | Git-diff | Run `git diff --name-only main...HEAD`, filter to lines matching `Mapper\.xml$\|Mapper\.java$\|ServiceImpl\.java$`, pass the resulting file list |

## Action

Spawn the `hhbp:sql-performance-reviewer` subagent immediately with the determined scope.
