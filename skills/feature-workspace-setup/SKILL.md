---
name: feature-workspace-setup
description: Create a git worktree in each of the N service repos for a multi-service feature, aggregate them under <REPO_ROOT>/features/<TICKET>/, generate the shared CLAUDE.md context file, and verify the baseline test suite passes in each worktree. Use whenever services have been confirmed and worktrees need setup, or whenever the user says "set up worktrees", "create the workspace", "prepare for parallel development", "make worktrees for these services". Invoked by springboot-feature-bootstrap as phase 2. Refuses to run if services_confirmed is false in feature-state.json.
---

# Feature Workspace Setup

<when_to_use>
- `feature-state.json` shows `services_confirmed: true` and `phase: workspace_setup`
- The user asks to set up worktrees for a multi-service feature
- Invoked by `springboot-feature-bootstrap` as phase 2

If `services_confirmed: false`, stop. Direct the user to confirm services via `service-discovery` first.
</when_to_use>

<context>
N worktrees instead of N branches means each service's work is physically isolated on disk — separate filesystem trees, separate Maven state, separate IDE indexes. That isolation prevents the cross-service interference that plagues mono-branch workflows. The cost is N filesystems' worth of disk and the discipline of keeping CLAUDE.md and feature-notes.md as the shared context.

Baseline test verification before any feature work matters because if `main` is already broken in a service, every downstream signal is unreliable — a test failure could be the existing breakage rather than the feature work. Surfacing it now saves debugging hours later.
</context>

<output_contract>
After this skill runs:
- `<REPO_ROOT>/features/<TICKET>/` exists
- N worktrees exist at `<REPO_ROOT>/features/<TICKET>/<service>/`, each on branch `feature/<TICKET>`
- `<REPO_ROOT>/features/<TICKET>/CLAUDE.md` exists with shared context
- `<REPO_ROOT>/features/<TICKET>/feature-notes.md` exists as an empty journal
- Baseline test results recorded in `feature-state.json` per service
- `feature-state.json` updated: `phase: contracts`, `completed_phases` includes `workspace_setup`
</output_contract>

<workflow>
Use TodoWrite. One todo per service plus three meta-todos (CLAUDE.md, feature-notes.md, state update).

### Step 1: Read state and verify preconditions

Read `<REPO_ROOT>/features/<TICKET>/feature-state.json`. Confirm:

- `services_confirmed: true`
- `phase` is `workspace_setup` or `discovery` (the latter is acceptable — we're advancing)
- `services` array is non-empty

If any check fails, stop and report.

### Step 2: Ensure the feature workspace directory exists

```bash
TICKET=$(jq -r .ticket feature-state.json)
mkdir -p <REPO_ROOT>/features/$TICKET
cd <REPO_ROOT>/features/$TICKET
```

### Step 3: For every service in `feature-state.json.services`, create a worktree

For each service (the entire list, not just the first):

```bash
REPO_PATH=<REPO_ROOT>/features/services/<service>
WORKTREE_PATH=<REPO_ROOT>/features/<TICKET>/<service>
BRANCH=feature/<TICKET>

cd "$REPO_PATH"
git fetch origin

# Idempotency: skip if worktree already exists
if git worktree list | grep -q "$WORKTREE_PATH"; then
  echo "Worktree already exists at $WORKTREE_PATH — reusing"
elif git rev-parse --verify "$BRANCH" 2>/dev/null; then
  git worktree add "$WORKTREE_PATH" "$BRANCH"
elif git rev-parse --verify "origin/$BRANCH" 2>/dev/null; then
  git worktree add "$WORKTREE_PATH" -b "$BRANCH" "origin/$BRANCH"
else
  git worktree add "$WORKTREE_PATH" -b "$BRANCH" origin/main
fi
```

If the service repo is not at `<REPO_ROOT>/features/services/<service>`, surface to the user and ask them to clone it. Cloning involves authentication and remote choice — the user owns those decisions.

### Step 4: Verify baseline tests pass in every worktree

```bash
cd "$WORKTREE_PATH"
./mvnw verify --batch-mode -q
```

Record results in `feature-state.json`:

```json
{
  "artifacts": {
    "baseline_tests": {
      "<service>": {
        "status": "passed" | "failed",
        "tests_run": <N>,
        "failures": <M>
      }
    }
  }
}
```

If baseline tests fail in any worktree, halt the chain:

> Baseline tests fail in `<service>` before any feature work has started. This means `main` is broken or the worktree is misconfigured. Halt the chain until this is resolved.

The user fixes before continuing.

### Step 5: Generate the shared CLAUDE.md

Write to `<REPO_ROOT>/features/<TICKET>/CLAUDE.md`:

<example>
```markdown
# Feature: PROJ-1234

## Ticket
Add 5% loyalty discount on orders over $100 for Gold-tier customers, with confirmation notification.

## Services in scope
- order-service
- loyalty-service
- notification-service

## Branch
All services on `feature/PROJ-1234`. Each worktree is at `<service>/`.

## Conventions
- Build / test: `./mvnw verify`
- Local profile: `-Dspring.profiles.active=test`
- Test framework: JUnit 5 + Mockito + AssertJ
- Contracts: see `contracts/`
- Per-service plans: see `<service>-plan.md`

## Service relationships
(from catalog: svc deps <service> per service in scope)

order-service → loyalty-service: HTTP GET /api/customers/{id}/tier
order-service → kafka: produces order.created event
notification-service → kafka: consumes order.created event

## Endpoints in scope
(populated by contract-first-design)

## Rules for this feature
- TDD for all boundary code (use test-driven-development skill)
- No service knows about another service's internals — only their contracts
- Correlation IDs propagate across all calls and events
```
</example>

The Service Relationships section comes from running `svc deps <service>` and `svc reverse-deps <service>` for each in-scope service. Embed the actual output, not cached data.

### Step 6: Create the feature notes journal

```bash
cat > <REPO_ROOT>/features/<TICKET>/feature-notes.md <<EOF
# Feature notes: <TICKET>

Running journal. Humans and skills append here.

## $(date +%Y-%m-%d) — Workspace created
- Worktrees set up for: <service list>
- Baseline tests passing in all
EOF
```

This file is intentionally informal — humans leave context here for later sessions.

### Step 7: Update state

```json
{
  "phase": "contracts",
  "phase_status": "success",
  "completed_phases": [..., "workspace_setup"],
  "artifacts": {
    "workspace_dir": "<REPO_ROOT>/features/<TICKET>",
    "worktrees": {
      "<service-1>": "<REPO_ROOT>/features/<TICKET>/<service-1>",
      "<service-2>": "<REPO_ROOT>/features/<TICKET>/<service-2>"
    },
    "claude_md": "<REPO_ROOT>/features/<TICKET>/CLAUDE.md",
    "baseline_tests": {...}
  }
}
```

### Step 8: Report

> Workspace set up for `<TICKET>`. N worktrees on `feature/<TICKET>`:
> - `<service-1>` (X tests passing)
> - `<service-2>` (Y tests passing)
> Shared context: `features/<TICKET>/CLAUDE.md`
> Next phase: contracts
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Surface a missing repo and ask the user to clone | Auto-clone with assumed auth and remote |
| Run baseline tests in every worktree | Skip baseline tests "to save time" |
| Ask before adopting a worktree on a different branch | Adopt silently and lose context |
| `git fetch origin` before `git worktree add` | Branch from stale main |
| Re-query catalog for CLAUDE.md service relationships | Reuse cached relationship data |
</anti_patterns>

<output_format>
Brief Step 8 summary only. Substantive content is in `CLAUDE.md` and `feature-state.json` — point at them.
</output_format>
