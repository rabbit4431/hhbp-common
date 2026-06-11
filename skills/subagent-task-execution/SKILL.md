---
name: subagent-task-execution
description: Execute an implementation plan task-by-task by dispatching a fresh subagent per task, with two-stage review (spec compliance + code quality) after each task. Use whenever a plan file exists at features/<TICKET>/<service>-plan.md and needs execution, or whenever the user says "work through the plan", "execute these tasks", "implement this plan", "run the plan for <service>". Each task runs in an isolated subagent to prevent context bleed between RED-GREEN-COMMIT cycles. Production-grade plan execution depends on this — manual sequential execution by a single context drifts.
---

# Subagent Task Execution

<when_to_use>
- A plan file exists at `<REPO_ROOT>/features/<TICKET>/<service>-plan.md`
- The user wants the plan executed
- Invoked by `parallel-implementation` (one stream of this skill per service in scope)

If no plan exists, invoke `writing-implementation-plan` first.
</when_to_use>

<context>
A single long-running agent accumulates context across tasks. Mid-plan, it remembers earlier tasks and starts "optimizing" — skipping verification, inferring instead of reading, batching commits. That drift is invisible until something breaks.

A fresh subagent per task reads only this task and its context. It can't skip steps it doesn't know exist, and it can't batch with work it hasn't seen. The cost (more subagent calls) buys discipline.
</context>

<output_contract>
Per task:
- Task is implemented in the worktree
- Tests pass
- A commit exists
- Spec-compliance reviewer approved
- Code-quality reviewer approved (or its findings logged for later cleanup)

When the plan is complete:
- All tasks marked `- [x]` in the plan file
- An impl report at `<REPO_ROOT>/features/<TICKET>/<service>-impl-report.md`
- `feature-state.json` updated: `artifacts.impl_reports.<service>` set
</output_contract>

<workflow>
Use TodoWrite. Create one todo per task, plus a final todo for the impl report.

### Step 1: Read the plan once

Read the plan file end-to-end. Extract:
- List of tasks with their full text
- Contract files referenced
- Worktree path

Don't re-read the plan during execution. Each task's text is passed to the implementer subagent as the source of truth.

### Step 2: For every task in the plan (not just the first), run the cycle below

For task N of M:

#### 2a. Dispatch the implementer subagent

Use the `Task` tool to dispatch a fresh subagent with this prompt:

<example>
```
You are implementing Task <N> of an implementation plan. Your context is fresh.

# Worktree
You are working in: <worktree-path>
cd to that directory before any work.

# Project conventions
<CLAUDE.md content from features/<TICKET>/>

# Contracts this task implements
<relevant contract file content>

# Your task
<full task text from the plan, including all 5 steps>

# Rules
1. Follow all 5 steps in order, including Step 2 (verifying the test fails before implementation).
2. Use the test-driven-development skill — RED-GREEN-COMMIT.
3. Write the code in the task. If the task is ambiguous on a point, ask a question rather than guess.
4. When done, output a structured summary:
   - Files created or modified
   - Step 2 output (the failure)
   - Step 4 output (the pass)
   - Commit SHA
```
</example>

#### 2b. Handle implementer questions

If the implementer asks a question, surface it to the user. Don't answer on their behalf — the implementer asks because the task is ambiguous. After the user answers, re-dispatch with the answer appended to the task text.

#### 2c. Dispatch the spec-compliance reviewer

After implementation, dispatch a fresh subagent to check spec compliance via `code-review-request`:

<example>
```
Use the code-review-request skill.

Scope: the commit just made (HEAD).
Plan task being checked: <task text>
Contract being satisfied: <contract file>

Specifically: report every deviation from the task — missing fields, added behaviors, wrong endpoint paths, anything the task does not authorize.

Report every finding you observe, including low-confidence ones. A separate triage step will rank them. Coverage matters more than filtering at this stage.

Do not comment on code quality here — the next reviewer covers that.
```
</example>

If verdict is BLOCK: re-dispatch the implementer with the Critical findings to fix. Cap retries at 3. After 3 failed attempts, escalate to the user — the task itself may be flawed.

#### 2d. Dispatch the code-quality reviewer

After spec compliance passes, dispatch another fresh subagent:

<example>
```
Use the code-review-request skill.

Scope: the commit just made (HEAD).
Project conventions: <CLAUDE.md content>

Specifically: report code quality observations — naming, abstraction, error handling, testing patterns. Surface every observation including low-confidence ones; a separate triage step ranks them.

The spec-compliance review already happened — do not repeat it.
```
</example>

If verdict is BLOCK on Critical issues: re-dispatch implementer to fix. Major and below: log to the impl report but proceed to the next task.

#### 2e. Mark the task done

Edit the plan file to change `- [ ]` to `- [x]` for this task.

#### 2f. Append to the impl report

Append a section to `<service>-impl-report.md`:

```markdown
## Task N: <description>
- Files: <list>
- Commit: <sha>
- Spec review: PASS (after <K> iterations)
- Quality review: PASS / <N> Major issues logged
```

### Step 3: After every task completes, write the impl report header

```markdown
# Implementation Report: <service>

- Plan: <service>-plan.md
- Tasks completed: M/M
- Commits made: M
- Spec-review iterations (total): <sum>
- Open Major issues (not blocking, for later cleanup): <list with line refs>

## Per-task detail
(the sections appended in 2f)
```

Update `feature-state.json`:

```json
{
  "artifacts": {
    "impl_reports": {
      "<service>": "<service>-impl-report.md"
    }
  }
}
```

If invoked by `parallel-implementation`, also update this service's per-service status flag (the parent skill tracks N parallel streams).
</workflow>

<review_mode_tuning>
The caller may pass a `review_mode` to control reviewer cost:

- `full` (default) — both spec and quality reviewers. ~3 subagents per task.
- `spec_only` — only the spec-compliance reviewer. ~2 subagents per task. Suitable for low-risk features.
- `none` — implementer self-reports only. 1 subagent per task. Use only for trivial features on non-tier-1 services.

Record the chosen mode in the impl report so reviewers downstream know what was checked.
</review_mode_tuning>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Fresh subagent per task | One subagent for the whole plan |
| Surface implementer questions to the user | Answer on the user's behalf |
| Spec compliance reviewer runs every task | Skip the spec reviewer because "the implementer is reliable" |
| Cap retry loops at 3 attempts | Loop indefinitely on BLOCK |
| Append-only impl report | Edit prior task sections retroactively |
| One commit per RED-GREEN cycle | Batch multiple tasks into one commit |
</anti_patterns>

<output_format>
Per task, output should be terse:

> Task 3/7: discount calculation
> Implementer: done, commit a3f1b2c
> Spec review: PASS
> Quality review: PASS
> Marked done in plan.

When the plan is complete:

> All 7 tasks complete in <service>. Impl report: `features/<TICKET>/<service>-impl-report.md`. State updated.

Substantive work output comes from the subagents — your role is the conductor's summary.
</output_format>
