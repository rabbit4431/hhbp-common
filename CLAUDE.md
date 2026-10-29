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
