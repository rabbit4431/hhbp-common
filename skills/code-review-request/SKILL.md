---
name: code-review-request
description: Run a code review by dispatching a fresh reviewer subagent against a worktree's diff. Use whenever the user says "review this code", "review this PR", "review the diff", "check my changes", or whenever another skill invokes it (subagent-task-execution after each task, cross-service-review per worktree, finishing-a-feature-branch before opening a PR). Returns findings categorized by severity (Critical / Major / Minor / Style) with confidence levels. Critical findings block the next step.
---

# Code Review Request

<when_to_use>

- Direct: "review this code," "review the diff"
- Invoked by `subagent-task-execution` after each task
- Invoked by `cross-service-review` once per worktree as the per-repo pass
- Invoked by `finishing-a-feature-branch` before opening a PR

</when_to_use>

<context>
The reviewer is a fresh subagent — a separate context that hasn't seen the implementation reasoning. That separation is what makes the review honest. A reviewer who participated in writing the code rationalizes the choices that were made; a fresh reviewer reads what's there.

Per Anthropic's prompt-engineering guidance for code review: the model investigates thoroughly and identifies bugs, but if the prompt says "be conservative" or "don't nitpick," the model filters out findings it judges below that bar. The result is fewer reported findings even when investigation depth is the same. The fix is to separate finding from filtering: surface everything with confidence levels at the finding stage, rank and filter downstream.
</context>

<output_contract>
A structured review with:
- Findings grouped under four severity levels
- Each finding has: file, line, description, suggested fix, confidence
- A verdict: PASS (no Critical findings) or BLOCK (one or more)

If invoked by another skill with a target path, the review is written there. Otherwise it's printed to chat.
</output_contract>

<workflow>
Use TodoWrite.

### Step 1: Establish the review scope

Determine what to review:
- Uncommitted diff: `git diff` + `git diff --cached`
- Recent commits: `git log <since>..HEAD -p`
- Specific task: files listed in that task's "Files" section

If the scope is unclear, ask the caller. Reviewing "everything" dilutes signal.

### Step 2: Gather context for the reviewer

Before dispatching, collect:
1. The `CLAUDE.md` in `features/<TICKET>/` if present — coding conventions
2. The contract files relevant to this diff — what the code is supposed to satisfy
3. The implementation plan task if reviewing per task — what was promised

Pass all three to the reviewer subagent.

### Step 3: Dispatch the reviewer subagent

Use the `Task` tool with this prompt:

<example>
```
You are reviewing code. You did not write it. Be specific.

# Scope
<exact files or diff range>

# Project conventions
<CLAUDE.md content>

# Contract this code claims to satisfy
<relevant contract file content>

# Plan task this code claims to implement (if applicable)
<task text from <service>-plan.md>

# Your job
Read the diff. Compare against the contract and the plan. Report every issue you find.

Report every finding you observe, including low-confidence ones. A separate triage step will rank and filter them. Your goal at this stage is coverage — surfacing a finding that later gets dismissed is preferable to silently dropping a real bug.

For each finding, provide:
- File path and line number
- One-sentence description of the issue
- Concrete suggested fix (a code snippet, not "consider refactoring")
- Severity: Critical / Major / Minor / Style
- Confidence: High / Medium / Low

Severity definitions:
- Critical: broken at runtime, violates the contract, security flaw, fails a test that should pass. Blocks progress.
- Major: works but has a real problem (wrong abstraction, missing error handling, race, production-impacting performance). Fix before merge.
- Minor: would improve the code but isn't urgent.
- Style: formatting, naming convention, import order. Cosmetic.

If you find nothing at a severity level, say "No findings at <severity>."
End with a one-line verdict: "PASS" (no Critical) or "BLOCK" (one or more Critical).
```
</example>

### Step 4: Parse the reviewer's output

Extract:
- Count of findings at each severity
- The PASS / BLOCK verdict
- The full text

### Step 5: Format and return

Format as markdown:

```markdown
## Code Review

**Verdict: PASS** (or BLOCK)

### Critical (N)
- `src/main/java/.../OrderController.java:42` — <issue>
  - Fix: `<concrete snippet>`
  - Confidence: High

### Major (N)
- ...

### Minor (N)
- ...

### Style (N)
- ...
```

If the caller specified a file path (e.g., `<service>-review.md`), write the markdown there. Otherwise print to chat.

### Step 6: Handle blocking findings

If verdict is BLOCK:
- Invoked by `subagent-task-execution`: the implementer subagent is re-dispatched with the Critical findings to fix.
- Invoked by `cross-service-review`: surface to the cross-repo report; the human triages.
- Invoked directly by user: state plainly — "BLOCK — N Critical issues. Fix these before proceeding."
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Fresh subagent reviews the code | Reviewing your own code in the same context |
| Pass the contract to the reviewer | Reviewer guesses what the code is supposed to do |
| Concrete fix snippet ("change line 42 to `X`") | "Could be cleaner" |
| Surface low-confidence findings with `Confidence: Low` | Filter them out at the finding stage |
| Honest severity assignment | Mark everything Critical to ensure it gets attention |
| Scope = files this task touched | Drift into adjacent code |
</anti_patterns>

<output_format>
Invoked by another skill: output is the verdict and the review file path. The full review text lives in the file.

Invoked by the user directly: output is the full formatted review.
</output_format>
