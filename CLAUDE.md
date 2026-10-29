# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Code Agent plugin** for Heshuo Harness Best Practices (HHBP) — providing development skills, specs, and safety hooks for Code Agent.

## Architecture

- **skills/** - Workflow definitions and domain knowledge (code generation, security review, etc.)
- **spec/** - Architecture and coding standards, and the feature-workflow design docs
- **scripts/hooks/** - Hook scripts (block-dangerous, git-workflow)
- **hooks/hooks.json** - Hook registration (PreToolUse: block-dangerous; PostToolUse: git-workflow)
- **mcp/mcp.json** - MCP server configurations
- **lsp/lsp.json** - LSP server configurations (jdtls, pyright, typescript)

## Model tiers

Skills pin a model per development phase via SKILL.md frontmatter:

| Tier (`metadata.hhbp-phase`) | `model` (Claude Code) | `metadata.codex-model` (Codex) | Skills |
|---|---|---|---|
| `design` | `claude-opus-5-5` | `gpt6-astra` | service-discovery, contract-first-design, writing-implementation-plan, cross-service-review, code-review-request, security-review |
| `impl` | `claude-sonnet-5-5` | `gpt6.1-sol` | all other workflow, codegen, and test skills |

`sql-analyze` and `slow-sql-optimize` set no tier and run on the session model. A new skill sets
all three keys (`model`, `metadata.hhbp-phase`, `metadata.codex-model`) or none of them. Claude Code
applies `model` directly; Codex has no per-skill model, so the workflow dispatcher routes design
phases to a subagent on the Codex model (see `skills/springboot-feature-bootstrap/references/phase-dispatcher.md`).
