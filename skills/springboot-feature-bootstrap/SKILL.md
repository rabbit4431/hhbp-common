---
name: springboot-feature-bootstrap
description: Orchestrate end-to-end development of a feature that spans multiple Spring Boot microservices. Use this skill at the START of any multi-service feature work — phrases like "start a new feature", "I have a ticket for PROJ-XXXX", "begin parallel development on N services", "kick off this requirement", or whenever the user pastes a multi-service ticket. Use proactively when the user pastes ticket text mentioning more than one domain or service — even without an explicit "start" or "begin". This skill walks the chain from discovery through PR merge, invoking the right sub-skill at each phase.
---

# Spring Boot Feature Bootstrap

<when_to_use>
- The user pastes a multi-service ticket
- The user says "start a feature," "kick off PROJ-XXXX," "begin work on this requirement"
- The user pastes ticket text mentioning more than one domain or service
- The user asks to resume work on an in-flight feature
</when_to_use>

<context>
This is the orchestrator. Your role is to walk the 9-phase chain by invoking the right sub-skill at each step, pause at hard gates, and resume from `feature-state.json` after interruption. The substantive work belongs to the sub-skills — your role is to dispatch and announce, briefly.
</context>

<repo_root>
`REPO_ROOT` is the freight35 monorepo checkout. Resolve it in this order:
1. An explicit path the user provides in their message.
2. The `$FREIGHT35_ROOT` environment variable (set this once in your shell profile).
3. `git rev-parse --show-toplevel` from the current working directory — works on
   any OS when you are already inside the repo.

If none of the above yields a path, stop and ask the user for the repo location.
All `<REPO_ROOT>/...` paths below refer to the resolved location.
</repo_root>

<output_contract>
Per turn:
- The state file is read or initialized
- The next phase's sub-skill is invoked
- The transition (or pause) is reported briefly

Across the chain: a feature progresses from `discovery` to `done` with three human-approval pauses along the way.
</output_contract>

<phase_table>
| Phase | Skill to invoke |
|---|---|
| 1. discovery | `service-discovery` |
| 2. workspace_setup | `feature-workspace-setup` |
| 3. contracts | `contract-first-design` |
| 4. planning | `writing-implementation-plan` (×N services) |
| 5. implementation | `parallel-implementation` |
| 6. integration_test | `multi-service-integration-test` |
| 7. review | `cross-service-review` |
| 8. prs | `multi-branch-merge` |
| 9. cleanup | `feature-cleanup` |
</phase_table>

<workflow>
Use TodoWrite to track each phase.

### Step 1: Determine fresh start vs resume

Check whether `<REPO_ROOT>/features/<TICKET>/feature-state.json` exists.

**Fresh start.** Initialize the state:

<example>
```bash
mkdir -p <REPO_ROOT>/features/<TICKET>
cat > <REPO_ROOT>/features/<TICKET>/feature-state.json <<EOF
{
  "ticket": "<TICKET>",
  "ticket_text": "<full ticket text>",
  "phase": "discovery",
  "phase_status": "in_progress",
  "services": [],
  "services_confirmed": false,
  "contracts_approved": false,
  "review_approved": false,
  "completed_phases": [],
  "artifacts": {}
}
EOF
```
</example>

If the user didn't provide a ticket ID, ask for one. The workspace path depends on it.

**Resume.** Read `feature-state.json`. Use the phase dispatcher to determine the next action — see `references/phase-dispatcher.md`.

### Step 2: Announce the chain (fresh starts only)

> Bootstrapping multi-service feature `<TICKET>`. 9 phases: discovery → workspace setup → contracts → planning → implementation → integration test → review → PRs → cleanup. Three approval checkpoints (after discovery, contracts, and review). Starting with phase 1.

One sentence per major idea. No expansion.

### Step 3: Run the phase dispatcher

The dispatch logic given current state lives in `references/phase-dispatcher.md`. Summary:

1. Read `state.phase` and `state.phase_status`
2. If `failed`: stop, report, do not auto-retry
3. If `needs_human`: pause, present artifact, wait
4. If `in_progress`: invoke the phase's skill
5. If `success`: advance per the transition table, then loop
</workflow>

<hard_gates>
Three points pause the chain for human approval, enforced by flags in `feature-state.json`:

| Gate | Flag | After phase |
|---|---|---|
| Services confirmed | `services_confirmed` | 1 (discovery) |
| Contracts approved | `contracts_approved` | 3 (contracts) |
| Review approved | `review_approved` | 7 (review) |

At each gate:
1. Present the artifact (rationale doc, contracts dir, review report)
2. Ask for approval explicitly
3. On clear approval ("approved", "yes", "go ahead"), set the flag and continue
4. On hedged language ("looks good?", "maybe", "I think so"), ask for explicit approval
5. On non-approval, ask what the user wants to change — do not continue

The chain treats hedged language as not-yet-approved because each gate guards against expensive downstream work.
</hard_gates>

<phase_transitions>
After each phase completes (`phase_status: success` written by the invoked skill):

1. Add the phase to `completed_phases`
2. Advance `phase` to the next phase
3. Set `phase_status: in_progress`
4. Invoke the next skill

When a phase ends in `failed`:
- Stop the chain
- Report the error
- Do not auto-retry — the user decides

When a phase ends in `needs_human`:
- Pause the chain
- Present what the skill produced
- Wait
</phase_transitions>

<idempotency>
If invoked on an existing `feature-state.json`, do not re-run completed phases. Read `completed_phases` and resume from the first incomplete phase.

If the user says "redo phase X":
- Remove phase X and all later phases from `completed_phases`
- Set `phase` to phase X
- Set the gate flags after X to `false`
- Re-invoke phase X's skill
</idempotency>

<per_phase_pattern>
For every phase (every phase, not just the first):

1. **Pre-check.** Read `feature-state.json`. Confirm prerequisites (gates passed, prior phases complete).
2. **Invoke.** Call the phase's skill. Each skill knows how to use the feature workspace.
3. **Wait.** The invoked skill writes `phase_status` when done.
4. **Gate (if applicable).** If this phase ends at a hard gate, present the artifact and pause.
5. **Advance.** Update `feature-state.json`, move to the next phase.

Phase 4 (planning) and phase 8 (PRs) invoke their skills N times — once per service:
- Phase 4: parallel; order doesn't matter
- Phase 8: sequential in `merge_order`; producers before consumers
</per_phase_pattern>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Invoke the phase's skill | Do the phase's work yourself |
| Wait for explicit "approved" | Treat hedged language as approval |
| Stop on `failed`, surface to user | Auto-retry on `failed` |
| Resume from `completed_phases` | Re-run completed phases on resume |
| One phase advance per turn | Power through multiple phases in one turn |
| Brief phase announcements | Long narrative summaries of what each phase did |
</anti_patterns>

<output_format>
A good bootstrap turn:

> Phase 1 (discovery) complete. 3 services identified: order-service, loyalty-service, notification-service. See `discovery-rationale.md`. Please confirm scope before I proceed to workspace setup.

A bad bootstrap turn:

> Phase 1 is complete and I think the services look right because the ticket mentions discounts which obviously involves order-service and loyalty-service, and then notification-service for the email, which makes sense because we always send notifications for important changes…

Sub-skills produce the substantive content. The bootstrap's role is brief transitions and gate prompts. If your output is longer than the sub-skills' output, you're talking too much.
</output_format>
