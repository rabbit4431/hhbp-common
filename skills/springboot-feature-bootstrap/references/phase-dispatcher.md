# Phase Dispatcher

Decision logic for "given current `feature-state.json`, what skill should I invoke next?"

## The dispatcher loop

After reading `feature-state.json`, follow this decision tree:

```
1. Read state.phase and state.phase_status
2. If phase_status == "failed":
     STOP, report to user
3. If phase_status == "needs_human":
     PAUSE, present artifact, wait
4. If phase_status == "in_progress":
     Invoke phase's skill (it may already be partly done; sub-skill handles resume)
5. If phase_status == "success":
     Advance to next phase per the transition table below
     Loop
```

## Transition table

| Current phase | Gate flag check | If gate passed, next phase | Skill to invoke for next |
|---|---|---|---|
| `discovery` | `services_confirmed` | `workspace_setup` | `feature-workspace-setup` |
| `workspace_setup` | (none) | `contracts` | `contract-first-design` |
| `contracts` | `contracts_approved` | `planning` | `writing-implementation-plan` ×N |
| `planning` | (none) | `implementation` | `parallel-implementation` |
| `implementation` | (none) | `integration_test` | `multi-service-integration-test` |
| `integration_test` | (none) | `review` | `cross-service-review` |
| `review` | `review_approved` | `prs` | `multi-branch-merge` |
| `prs` | (none) | `cleanup` | `feature-cleanup` |
| `cleanup` | (none) | `done` | (terminal — congratulate user) |

## Gate handling

When the current phase ends and the gate flag is false:

1. Read the artifact the phase produced (rationale doc, contracts dir, review report)
2. Display the artifact path to the user
3. Ask: "Do you approve this and want to proceed to <next phase>? Reply 'approved' to continue."
4. On approval, set the flag in `feature-state.json` and continue the loop
5. On non-approval, do NOT continue. Ask the user what they want to change.

## Phase-specific notes

### `planning` (phase 4)

This phase invokes `writing-implementation-plan` once per service in `state.services`. These invocations can run in parallel (they don't depend on each other).

Each invocation writes its plan to `<service>-plan.md` and adds an entry to `state.artifacts.plans`.

The phase is complete when every service in `state.services` has a corresponding entry in `state.artifacts.plans`.

### `prs` (phase 8)

This phase invokes `finishing-a-feature-branch` once per service, in the order specified by `state.merge_order`. `merge_order` is set by `multi-branch-merge` based on dependency direction (providers before consumers).

Invocations are sequential — wait for each PR to be opened before opening the next.

### `done` (terminal)

Print a summary:
- Ticket
- Services changed
- PRs opened (with links)
- Total elapsed time

Then exit. Do not loop further.

## Failure recovery

If a sub-skill returns `failed`:

1. Stop the loop
2. Print the failure reason
3. Suggest concrete next actions:
   - "Re-run phase X with `redo phase X`"
   - "Investigate with `systematic-debugging` skill" (if installed)
   - "Skip to phase Y manually if X is non-essential"

Do not auto-retry. Failures usually mean the human needs to make a decision.

## Example traces

### Happy path

```
[state: phase=discovery, in_progress]
  → invoke service-discovery
[state: phase=discovery, needs_human, services_confirmed=false]
  → pause; show rationale doc; ask for confirmation
[user: "approved"]
  → set services_confirmed=true
[state: phase=discovery, success, services_confirmed=true]
  → advance to workspace_setup
  → invoke feature-workspace-setup
[state: phase=workspace_setup, success]
  → advance to contracts
  → invoke contract-first-design
... and so on
```

### Resume after interruption

```
User: "continue working on PROJ-1234"
  → read <REPO_ROOT>/features/PROJ-1234/feature-state.json
[state: phase=implementation, in_progress, completed_phases=[discovery, workspace_setup, contracts, planning]]
  → resume by invoking parallel-implementation
  (the sub-skill checks its own per-service progress and picks up where it left off)
```

### Failure

```
[state: phase=implementation, failed, error="Maven build failed in payment-service: missing dependency"]
  → stop
  → report to user
  → suggest: "Fix the dependency in payment-service, then say 'continue PROJ-1234' to resume"
```
