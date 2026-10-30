# Phase Dispatcher

Decision logic for "given current `feature-state.json`, what skill should I invoke next?"

## State ownership

Each field has one owner, so two writers never race to advance the chain:

| Field | Written by |
|---|---|
| `phase` | **The dispatcher only** moves `phase` to a different phase — forward on `success`, back on `needs_repair`. A phase skill may set `phase` to its *own* phase (e.g. when invoked directly), never to the next one. Exception: `feature-cleanup` stamps `done` in the archived copy, because it deletes the live workspace. |
| `phase_status` | The phase skill, for its own phase. The dispatcher rewrites it when it advances or routes back (`in_progress`) and when it escalates (`needs_human`). |
| `completed_phases` | The phase skill appends its own phase on `success` (only if absent). The dispatcher ensures the entry on advance and removes entries on route-back or "redo". |
| Gate flags | The gated skill sets its flag `false` when it presents. Whoever receives explicit approval — the skill if still active, otherwise the dispatcher — sets it `true`. |
| `iterations`, `max_iterations` | The dispatcher (initialized by the bootstrap). |
| `error_class`, `feedback_ref` | A loopable phase sets them on a recoverable miss and clears them (`null`) when it meets acceptance. Any phase sets `error_class="blocker"` on a blocker. The dispatcher keeps them on route-back — the repair phase needs them. |

## The dispatcher loop

After reading `feature-state.json`, follow this decision tree:

```
1. Read state.phase and state.phase_status
2. If phase_status == "failed":          // blocker (error_class="blocker")
     STOP, report to user
3. If phase_status == "needs_repair":    // recoverable failure — bounded repair loop
     If iterations[phase] >= max_iterations:
       set phase_status="needs_human", error_class="recoverable"   // budget exhausted → escalate
       PAUSE, present feedback_ref, wait (see "Escalation responses")
     Else:
       iterations[phase] += 1
       remove "implementation" and every later phase from completed_phases
       set phase="implementation", phase_status="in_progress"   // repair target, back-edge table
       keep feedback_ref and error_class so the repair phase knows what to fix
       Loop
4. If phase_status == "needs_human":
     If error_class == "recoverable":    // loop escalation, not a gate
       PAUSE, present feedback_ref, wait (see "Escalation responses")
     Else if the phase's gate flag is false and the user's message is explicit approval:
       set <gate flag>=true, phase_status="success", add phase to completed_phases
       Loop
     Else:
       PAUSE, present artifact, wait
5. If phase_status == "in_progress":
     Invoke phase's skill (it may already be partly done; sub-skill handles resume)
6. If phase_status == "success":
     If the phase has a gate flag and it is false: handle as needs_human (step 4)
     Add phase to completed_phases if absent
     Set phase=<next phase per the transition table below>, phase_status="in_progress"
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
skill's `model` frontmatter (design = Opus, impl = Sonnet), which only Claude Code applies — see
"Model selection" below.

The `discovery → workspace_setup` transition depends **only** on `services_confirmed == true`,
independent of `len(state.services)`. A single confirmed service advances exactly like many — do
not stop because discovery found only one service.

## Model selection

- **Claude Code:** each skill's `model` frontmatter switches the model while the skill is active.
  Invoke skills normally — nothing else to do.
- **Codex and other harnesses:** skills do not select a model. Every phase runs inline on the
  session model, and subagents inherit it. Never spawn a subagent just to change models.

A skill whose job is itself to dispatch a subagent (`code-review-request`, which spawns a fresh
reviewer) is never wrapped in its own subagent: run its steps inline in the calling thread and
spawn only the subagent it dispatches. Wrapping it adds a nesting level the harness may refuse
(Codex caps spawn depth with `agents.max_depth`).

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

Route-back bookkeeping (step 3 of the loop):

- Remove `implementation` and every later phase from `completed_phases`. The re-runs are part of
  the loop, not a "redo", so the completed-phase refusal in each sub-skill does not apply.
- Leave `services_confirmed` and `contracts_approved` untouched; `review_approved` is already `false`.
- Keep `feedback_ref` and `error_class`. `parallel-implementation` sees a non-null `feedback_ref`
  and runs in **repair mode**: it fixes only what `feedback_ref` lists, through
  `<service>-repair-<N>.md` plans, in the affected services only.
- Re-verification reuses the existing compose file and integration tests. Reports
  (`integration-results.md`, `REVIEW.md`, per-repo reviews) are regenerated each iteration
  without asking.
- Counters are per feature: a later green run does not reset them, so `max_iterations` bounds the
  total repairs each loopable phase can trigger. Only "keep repairing" or "redo" resets them.

## Gate handling

A gated phase (`discovery`, `contracts`, `review`) ends with `phase_status="needs_human"` and its
gate flag `false`:

1. Read the artifact the phase produced (rationale doc, contracts dir, review report)
2. Display the artifact path to the user
3. Ask: "Do you approve this and want to proceed to <next phase>? Reply 'approved' to continue."
4. On explicit approval, set the flag `true`, set `phase_status="success"`, add the phase to
   `completed_phases`, and continue the loop (step 6 advances)
5. On non-approval, do NOT continue. Ask the user what they want to change.

The `review` gate is only reached with a PASS verdict — a BLOCK verdict goes through the repair
loop first.

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
   `needs_human` + `error_class="recoverable"` and present `feedback_ref` to the user (see
   "Escalation responses").

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

A fix that needs an approved contract changed is always a blocker: the repair loop works inside
the contracts and never edits them. The user resolves it with `redo phase contracts`.

## Escalation responses

When a loop escalates (`needs_human`, `error_class="recoverable"`), present `feedback_ref` and
act on the user's explicit choice:

- **"keep repairing"** — reset `iterations[phase]` to 0, set `phase_status="needs_repair"`, loop.
- **"I fixed it, continue"** — set `phase_status="in_progress"`, `error_class=null`,
  `feedback_ref=null`, and re-run the failing phase directly (no route-back, counter unchanged).
- **"redo phase X"** — per the idempotency rules in `SKILL.md`.

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
  → iterations.review → 1; drop implementation, integration_test from completed_phases
  → route back: phase=implementation, in_progress
  → invoke parallel-implementation (repair mode: fix per REVIEW.md)
[state: phase=implementation, success]
  → advance: phase=integration_test → invoke multi-service-integration-test
[state: phase=integration_test, success, feedback_ref=null]
  → advance: phase=review → invoke cross-service-review
[state: phase=review, needs_human, review_approved=false, error_class=null]
  → PASS verdict; present REVIEW.md at the review_approved gate; ask human for approval
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
