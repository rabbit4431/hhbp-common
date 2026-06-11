---
name: feature-cleanup
description: After all feature branches for a multi-service feature have been merged into the baseline branch, remove the worktrees, delete local branches, and archive the feature workspace (CLAUDE.md, contracts, REVIEW.md, MERGE_PLAN.md, notes) to catalog/docs/feature-history/. Use whenever a multi-service feature has shipped and the workspace can be torn down, or whenever the user says "clean up this feature", "tear down the worktrees", "archive PROJ-XXXX". Invoked by springboot-feature-bootstrap as phase 9. Always verify all branches are actually merged before removing anything — do not tear down work in flight.
---

# Feature Cleanup

<when_to_use>
- `feature-state.json` shows `phase: cleanup` and `merges` populated with N commit hashes
- The user says all feature branches are merged and the workspace can be torn down
- Invoked by `springboot-feature-bootstrap` as phase 9
</when_to_use>

<context>
Cleanup is destructive: worktrees removed, branches deleted, the workspace moved to an archive. Done before branches are actually merged, you lose work. The verify-then-cleanup ordering below makes it safe to invoke even on a feature you're not certain has shipped — if any branch is not yet in the baseline, this skill stops without touching anything.

The team uses GitLab for version control. Verification uses `git merge-base --is-ancestor` to confirm each feature branch tip is reachable from the baseline branch — no GitLab API calls needed.

The archive in `catalog/docs/feature-history/<TICKET>/` preserves the artifacts (CLAUDE.md, contracts, REVIEW.md, MERGE_PLAN.md, integration-results.md, feature-notes.md). When the next person works on these services, those documents serve as the answer to "why was this designed this way?"
</context>

<output_contract>
- Every worktree removed
- Every local feature branch deleted
- Feature workspace contents archived to `catalog/docs/feature-history/<TICKET>/`
- The original `<REPO_ROOT>/features/<TICKET>/` directory removed
- `feature-state.json` of the archived feature marked `phase: done`
- Verified: all feature branches are ancestors of the baseline before any destructive action
</output_contract>

<workflow>
Use TodoWrite.

### Step 1: Read state

Read `<REPO_ROOT>/features/<TICKET>/feature-state.json`. Confirm:
- `phase: cleanup` (advanced by `multi-branch-merge`)
- `merges` contains N commit hashes (one per service)
- `baseline_branch` is present

If `phase` is not `cleanup`, surface to the user — running cleanup on a feature that isn't ready loses work.

### Step 2: Verify every feature branch is actually merged into the baseline

```bash
MAIN=$(git worktree list | head -1 | awk '{print $1}')
BASELINE_BRANCH=$(jq -r '.baseline_branch' features/<TICKET>/feature-state.json)

cd "$MAIN"
git fetch origin
```

For every service in `feature-state.json.services` (every one — not just the first):

```bash
BRANCH="feature/<TICKET>-<service>"   # or the actual branch name from state
if ! git merge-base --is-ancestor "$BRANCH" "$BASELINE_BRANCH"; then
  echo "Branch $BRANCH has not been merged into $BASELINE_BRANCH. Stop."
  exit 1
fi
```

Exit code 0 from `git merge-base --is-ancestor` means the branch tip is an ancestor of the baseline (i.e., fully merged). Non-zero means the branch has commits not yet in the baseline — stop:

> Cannot clean up `<TICKET>` — branch `<branch>` for `<service>` is not yet merged into `<baseline>`. Merge it first, then run cleanup.

This check is the safety net. Skipping it could remove a worktree whose changes were never shipped.

### Step 3: Confirm with the user (when invoked directly)

Cleanup is destructive. When invoked directly by the user, confirm once before proceeding:

> About to clean up `<TICKET>`:
> - Remove N worktrees: `<list>`
> - Delete N local branches: `<list>`
> - Archive workspace to `catalog/docs/feature-history/<TICKET>/`
> - Remove `<REPO_ROOT>/features/<TICKET>/`
>
> All PRs verified merged. Type "cleanup" to confirm.

When invoked by `springboot-feature-bootstrap`, the bootstrap already gated this with the user — skip this prompt.

### Step 4: Archive the workspace

```bash
ARCHIVE_DIR=~/work/catalog/docs/feature-history/<TICKET>
mkdir -p "$ARCHIVE_DIR"

# Copy artifacts (not worktrees — those go away)
cp <REPO_ROOT>/features/<TICKET>/CLAUDE.md              "$ARCHIVE_DIR/"
cp <REPO_ROOT>/features/<TICKET>/feature-state.json     "$ARCHIVE_DIR/"
cp <REPO_ROOT>/features/<TICKET>/feature-notes.md       "$ARCHIVE_DIR/"
cp -r <REPO_ROOT>/features/<TICKET>/contracts            "$ARCHIVE_DIR/" 2>/dev/null || true
cp <REPO_ROOT>/features/<TICKET>/REVIEW.md              "$ARCHIVE_DIR/" 2>/dev/null || true
cp <REPO_ROOT>/features/<TICKET>/MERGE_PLAN.md          "$ARCHIVE_DIR/" 2>/dev/null || true
cp <REPO_ROOT>/features/<TICKET>/integration-results.md "$ARCHIVE_DIR/" 2>/dev/null || true
# Per-service plans and impl reports too
cp <REPO_ROOT>/features/<TICKET>/*-plan.md              "$ARCHIVE_DIR/" 2>/dev/null || true
cp <REPO_ROOT>/features/<TICKET>/*-impl-report.md       "$ARCHIVE_DIR/" 2>/dev/null || true
```

Write a `README.md` in the archive that points at the relevant merge commits:

<example>
```markdown
# PROJ-1234 — Loyalty Discount Feature

Shipped <date>. Archived from `<REPO_ROOT>/features/PROJ-1234/`.
Merged into baseline branch: `feature-2606-loyalty-discount`

## Merges
- payment-service: `abc1234` (merged <date>)
- order-service: `def5678` (merged <date>)
- notification-service: `ghi9012` (merged <date>)

## Artifacts in this folder
- `CLAUDE.md` — shared context used during development
- `feature-state.json` — final state of the chain
- `contracts/` — inter-service contracts as approved
- `REVIEW.md` — cross-service review
- `MERGE_PLAN.md` — merge order and post-merge checklist
- `integration-results.md` — integration test results at time of shipping
- `*-plan.md` — per-service implementation plans
- `*-impl-report.md` — per-service implementation reports

## How to use this archive
When someone asks "why was X designed this way?" or "what did the loyalty discount
contract look like?", read the relevant file in this folder. These were the working
documents at the time of shipping.
```
</example>

### Step 5: Mark archived state as done

```bash
jq '.phase = "done" | .phase_status = "success" | .completed_phases += ["cleanup"]' \
  "$ARCHIVE_DIR/feature-state.json" > "$ARCHIVE_DIR/feature-state.json.tmp"
mv "$ARCHIVE_DIR/feature-state.json.tmp" "$ARCHIVE_DIR/feature-state.json"
```

### Step 6: Remove worktrees

For every service in `feature-state.json.services` (every one):

```bash
REPO_PATH=<REPO_ROOT>/features/services/<service>
WORKTREE_PATH=<REPO_ROOT>/features/<TICKET>/<service>
BRANCH=feature/<TICKET>

cd "$REPO_PATH"

# Remove the worktree
git worktree remove "$WORKTREE_PATH" --force

# Delete the local branch (remote keeps it for history; merged so safe)
git branch -d "$BRANCH" 2>/dev/null || git branch -D "$BRANCH"
```

### Step 7: Remove the feature directory

```bash
rm -rf <REPO_ROOT>/features/<TICKET>
```

### Step 8: Report

> Cleanup complete for `<TICKET>`.
>
> - Removed N worktrees
> - Deleted N local branches
> - Archived workspace to `~/work/catalog/docs/feature-history/<TICKET>/`
> - Original `<REPO_ROOT>/features/<TICKET>/` removed
>
> Feature shipped. 🚢
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| `git merge-base --is-ancestor` to verify each branch is merged | Trust the user's word that branches merged |
| Confirm "cleanup" before destructive action (direct invocation) | Run cleanup as soon as invoked |
| Archive artifacts before removing | Remove first, archive what remains (nothing) |
| Use `git worktree remove --force` only after verify | `rm -rf` the worktree directly |
| Keep remote branches (merged ones are history) | Delete remote branches too |
| Mark archive's `feature-state.json` as `done` | Leave it mid-state |
| Check `merges` field in state (not `prs`) | Use GitHub PR API for verification |
</anti_patterns>

<output_format>
Step 8 report only. Brief celebration if the chain shipped end-to-end.
</output_format>
