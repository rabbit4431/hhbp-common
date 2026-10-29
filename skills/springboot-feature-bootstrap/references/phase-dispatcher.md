# Phase Dispatcher

Decision logic for "given current `feature-state.json`, what skill should I invoke next?"

## The dispatcher loop

After reading `feature-state.json`, follow this decision tree:

```
1. Read state.phase and state.phase_status
2. If phase_status == "failed":          // blocker (error_class="blocker")
     STOP, report to user
3. If phase_status == "needs_repair":    // recoverable failure — bounded repair loop
     If iterations[phase] >= max_iterations:
       set phase_status="needs_human", error_class="recoverable"   // budget exhausted → escalate
       PAUSE, present feedback_ref, wait
     Else:
       iterations[phase] += 1
       set phase = <repair target from back-edge table> (implementation), phase_status="in_progress"
       keep feedback_ref so the repair phase knows what to fix
       Loop
4. If phase_status == "needs_human":
     PAUSE, present artifact, wait
5. If phase_status == "in_progress":
     Invoke phase's skill (it may already be partly done; sub-skill handles resume),
     routed to the skill's model tier — see "Model routing" below
6. If phase_status == "success":
     Advance to next phase per the transition table below
     Loop
```

## Transition table

| Current phase | Gate flag check | If gate passed, next phase | Skill to invoke for next | Model tier of next |
|---|---|---|---|---|
| `discovery` | `services_confirmed` | `workspace_setup` | `feature-workspace-setup` | impl |
| `workspace_setup` | (none) | `contracts` | `contract-first-design` | design |
| `contracts` | `contracts_approved` | `planning` | `writing-implementation-plan` ×N | design |
| `planning` | (none) | `implementation` | `parallel-implementation` | impl |
| `implementation` | (none) | `integration_test` | `multi-service-integration-test` | impl |
| `integration_test` | (none) | `review` | `cross-service-review` | design |
| `review` | `review_approved` | `prs` | `multi-branch-merge` | impl |
| `prs` | (none) | `cleanup` | `feature-cleanup` | impl |
| `cleanup` | (none) | `done` | (terminal — congratulate user) | — |

The first phase, `discovery` (`service-discovery`), is design tier. The tier column mirrors each
skill's `metadata.hhbp-phase` frontmatter, which is the source of truth.

The `discovery → workspace_setup` transition depends **only** on `services_confirmed == true`,
independent of `len(state.services)`. A single confirmed service advances exactly like many — do
not stop because discovery found only one service.

## Model routing

Each phase skill declares its model tier in frontmatter: `model` (Claude Code model ID),
`metadata.hhbp-phase` (`design` / `impl`), and `metadata.codex-model` (Codex model ID). Design
phases (discovery, contracts, planning, review) run on the design model; everything else runs on
the impl model. How the switch happens depends on the harness:

- **Harness honors `model` frontmatter (Claude Code):** invoke the skill normally — it switches
  the model itself while active. Nothing else to do.
- **Harness has no per-skill model (Codex):** read the target skill's `metadata.codex-model`.
  - Equal to the current session model → invoke the skill inline.
  - Different → spawn **one subagent with `model` set to that value** and brief it with: the
    skill name, the workspace path `features/<TICKET>/`, and `feedback_ref` if set. Wait for it,
    then **re-read `feature-state.json`** and continue the loop. Fan-out phases (`planning` ×N)
    spawn one subagent per service, all on that model.

A phase subagent never waits on the user. When it needs clarification (e.g. service-discovery
"stop and ask the user") or reaches its gate, it writes the question or artifact path to
`feature-notes.md`, sets `phase_status="needs_human"`, and returns. The dispatcher then runs
"Gate handling" (or asks the question) in the main thread and re-spawns the phase on resume.

Subagents dispatched *inside* a phase (code-review-request, security-review, the cross-repo
review pass, per-task implementers) use the dispatched skill's `metadata.codex-model` when it has
one, otherwise the phase's model. Request the model explicitly at spawn time — do not rely on the
default subagent model.

## Back-edge table (repair loops)

When a loopable phase reports `needs_repair`, route back per this table instead of advancing.
The repair runs `implementation` again (fed by `feedback_ref`), then re-verifies forward.

| Failing phase | Condition | Repair target | After repair, re-run |
|---|---|---|---|
| `integration_test` | recoverable test failure | `implementation` | `integration_test` |
| `review` | `REVIEW.md` has blocking findings | `implementation` | `integration_test` → `review` |

The `review` repair loop runs **before** the `review_approved` gate: blocking findings are
auto-fixed and re-verified (up to `max_iterations`), so the human gate only sees a clean result
or an escalation. The gate still requires explicit human approval.

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

Distinguish recoverable failures from blockers — they take different paths.

**Recoverable (`needs_repair`, `error_class="recoverable"`)** — a loopable phase missed its
acceptance condition (tests failed, review found blocking issues):

1. Route back via the back-edge table to `implementation`, fed by `feedback_ref`.
2. Re-verify forward (re-run `integration_test`, then `review`).
3. Repeat up to `max_iterations` (default 3). If still not green, escalate: set
   `needs_human` + `error_class="recoverable"` and present `feedback_ref` to the user.

**Blocker (`failed`, `error_class="blocker"`)** — missing dependency, ambiguous contract, infra
failure; the loop cannot fix it:

1. Stop the loop
2. Print the failure reason
3. Suggest concrete next actions:
   - "Re-run phase X with `redo phase X`"
   - "Investigate with `systematic-debugging` skill" (if installed)
   - "Skip to phase Y manually if X is non-essential"

Never auto-retry a blocker, and never loop a recoverable failure past `max_iterations` —
both escalate to the human for a decision.

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

### Recoverable repair loop (review findings)

```
[state: phase=review, needs_repair, error_class=recoverable,
        feedback_ref=REVIEW.md, iterations.review=0]
  → blocking findings in REVIEW.md; iterations.review → 1
  → route back: phase=implementation, in_progress (fix per REVIEW.md)
  → re-run: phase=integration_test → success
  → re-run: phase=review
[state: phase=review, success, review_approved=false]
  → clean result; present to review_approved gate; ask human for approval
```

### Budget exhaustion → escalation

```
[state: phase=integration_test, needs_repair, error_class=recoverable, iterations.integration_test=3]
  → iterations.integration_test >= max_iterations (3)
  → set phase_status=needs_human, error_class=recoverable
  → pause; present failing test output (feedback_ref); ask human how to proceed
```

### Blocker (no auto-retry)

```
[state: phase=implementation, failed, error_class=blocker,
        error="Maven build failed in payment-service: missing dependency"]
  → stop
  → report to user
  → suggest: "Fix the dependency in payment-service, then say 'continue PROJ-1234' to resume"
```
