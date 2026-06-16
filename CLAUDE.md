# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Claude Code plugin** for Heshuo Harness Best Practices (HHBP) — providing production-ready hooks, commands, and session lifecycle automation for Claude Code.

## Architecture

- **skills/** - Workflow definitions and domain knowledge (code generation, security review, etc.)
- **scripts/hooks/** - Session lifecycle scripts (session-start, session-end, git-workflow, block-dangerous)
- **scripts/lib/** - Shared utility library (package-manager, project-detect)
- **mcp-configs/** - MCP server configurations
- **hooks/hooks.json** - Claude Code hook registration (SessionStart/PreToolUse/PostToolUse/SessionEnd/Stop)
- **commands/** - Slash commands invoked by users (/sessions, etc.)
- **tests/** - Test suite for hook scripts
