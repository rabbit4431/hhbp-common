---
name: multi-branch-merge
description: Merge N feature branches into the iteration baseline branch in dependency order, producing a merge commit per service and a MERGE_PLAN.md. Use whenever a multi-service feature has passed review and is ready to ship, or whenever the user says "merge the branches", "ship this feature". Invoked by springboot-feature-bootstrap as phase 8. Invokes finishing-a-feature-branch once per worktree in merge_order. Producers merge before consumers — never reverse this order.
---

# Multi-Branch Merge Coordination

<when_to_use>
- `feature-state.json` shows `review_approved: true` and `phase: prs`
- All worktrees have green builds (verified during cross-service-review)
- The user wants feature branches merged into the baseline
- Invoked by `springboot-feature-bootstrap` as phase 8
</when_to_use>

<context>
N feature branches that depend on each other must merge into the baseline in a specific order. Merging the consumer first leaves the baseline temporarily broken (calling a contract endpoint that doesn't exist yet). Merging the producer first is safe — the new endpoint or event is available before anyone calls or consumes it.

The team uses GitLab for version control. Feature branches are merged **locally** into the iteration baseline branch (e.g. `feature-2606-<slug>`) using `git merge --no-ff` — no GitLab MRs are created for individual feature branches.

This skill computes the dependency-aware merge order from the contracts (producers merge before their consumers), writes that order into `MERGE_PLAN.md`, and merges each branch via `finishing-a-feature-branch` so the per-branch cleanup is consistent.
</context>

<required_skills>
- `finishing-a-feature-branch` — invoked once per worktree
</required_skills>

<output_contract>
- `<REPO_ROOT>/features/<TICKET>/MERGE_PLAN.md` with the merge order, commit hashes, and post-merge checklist
- N feature branches merged into the baseline in the main workspace, each with a `--no-ff` merge commit
- `feature-state.json` updated: `phase: cleanup`, `merge_order` populated, `merges` populated
</output_contract>

<workflow>
Use TodoWrite. Three phases: compute merge order, merge branches, write MERGE_PLAN.md.

### Step 1: Compute merge order from contracts

Read every file in `features/<TICKET>/contracts/`. For each contract:
- Producer merges first (its endpoint or event must exist before anyone uses it)
- Consumer merges second

If contracts form a DAG, topologically sort to get a linear order. If contracts form a cycle (rare but possible — two services with bidirectional dependencies introduced together), surface to the user:

> Contracts form a cycle: `<svc-a>` depends on `<svc-b>` and `<svc-b>` depends on `<svc-a>`. Choose a deployment strategy:
> 1. Feature-flag the consumer side, merge producer first, enable flag after
> 2. Coordinated merge — both branches merge in the same window
> 3. Restructure contracts to break the cycle
>
> Reply with your chosen strategy before I merge branches.

Record the order in `feature-state.json.merge_order`.

### Step 2: Read the baseline branch

```bash
BASELINE_BRANCH=$(jq -r '.baseline_branch' features/<TICKET>/feature-state.json)
```

If `baseline_branch` is missing from state, fall back to the current branch of the main workspace:
```bash
MAIN=$(git worktree list | head -1 | awk '{print $1}')
BASELINE_BRANCH=$(git -C "$MAIN" branch --show-current)
```

### Step 3: For every worktree (in merge_order, every one — not just the first), invoke finishing-a-feature-branch

```
For service in merge_order:
  Task: finishing-a-feature-branch
    args:
      worktree: features/<TICKET>/<service>
      disposition: merge    # caller specifies; skill skips its own prompt
      baseline_branch: <BASELINE_BRANCH>
```

These are sequential — wait for each merge to complete and confirm the baseline branch still builds before merging the next. Order matters: do not parallelize.

Record each merge commit hash (from finishing-a-feature-branch Step 8 report) in `feature-state.json.merges.<service>`.

### Step 4: Write MERGE_PLAN.md

`<REPO_ROOT>/features/<TICKET>/MERGE_PLAN.md`:

<example>
```markdown
# Merge Plan: PROJ-1234

Baseline branch: `feature-2606-loyalty-discount`

## Merge order (do not reverse)

1. **payment-service** — merged as `abc1234`
   - Producer for `order-to-payment.md`
   - Merged first
2. **order-service** — merged as `def5678`
   - Consumer of payment, producer of `order.created` event
   - Merged after payment-service
3. **notification-service** — merged as `ghi9012`
   - Consumer of `order.created` event
   - Merged last

## Post-merge checklist

For each service after merging:
- [ ] Build green on baseline branch: `./mvnw verify`
- [ ] No regression in downstream services
- [ ] Integration smoke test passes

## Feature flag

(if applicable) Feature is gated by `loyalty_discount_enabled` config. Enabled in:
- [ ] dev
- [ ] staging
- [ ] prod (after baseline is promoted)
```
</example>

### Step 5: Update state

```json
{
  "phase": "cleanup",
  "phase_status": "success",
  "completed_phases": [..., "prs"],
  "merge_order": ["payment-service", "order-service", "notification-service"],
  "merges": {
    "payment-service": "abc1234",
    "order-service": "def5678",
    "notification-service": "ghi9012"
  },
  "artifacts": {
    "merge_plan": "MERGE_PLAN.md"
  }
}
```

Note: phase advances to `cleanup` but actual cleanup waits until the user confirms all merges are done. `feature-cleanup` will verify before tearing down.

### Step 6: Report

> N branches merged into `<BASELINE_BRANCH>` for `<TICKET>`. Merge order in `features/<TICKET>/MERGE_PLAN.md`:
> 1. payment-service: `abc1234`
> 2. order-service: `def5678`
> 3. notification-service: `ghi9012`
>
> When ready to clean up worktrees, run: "clean up `<TICKET>`".
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Producers merge before consumers | Whatever order the worktree list returns |
| Surface contract cycles to the user | Pick an order arbitrarily for cyclic dependencies |
| Verify baseline builds after each merge before proceeding | Merge all branches then discover a conflict |
| MERGE_PLAN.md captures merge order and commit hashes | Order lives only in the bootstrap's head |
| Read `baseline_branch` from feature-state.json | Hard-code `origin/main` as merge target |
</anti_patterns>

<output_format>
The Step 6 report. Don't repeat per-service details — they're in MERGE_PLAN.md.
</output_format>
