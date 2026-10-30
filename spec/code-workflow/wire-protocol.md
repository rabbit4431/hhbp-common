# Wire Protocol

How skills in this collection share state and artifacts.

## The feature workspace

Every multi-service feature has a workspace directory:

```
~/work/features/<TICKET>/
├── feature-state.json       ← the source of truth for chain progress
├── feature-notes.md         ← human + AI running journal
├── CLAUDE.md                ← shared context for all skills + subagents
├── contracts/               ← contract-first-design outputs
│   ├── order-to-payment.md
│   ├── order-to-notification.md
│   └── ...
├── <service>-plan.md        ← writing-implementation-plan output, one per service
├── <service>-impl-report.md ← subagent-task-execution output, one per service
├── <service>-repair-<N>.md  ← parallel-implementation repair-mode plan, one per repair round
├── integration-results.md   ← multi-service-integration-test output (feedback_ref on failure)
├── REVIEW.md                ← cross-service-review output (feedback_ref on BLOCK)
├── PR_PLAN.md               ← multi-branch-merge output
└── docker-compose.dev.yml   ← multi-service-integration-test output
```

The N service worktrees live alongside this directory:

```
~/work/features/<TICKET>/<service>/      ← git worktree per service
```

## feature-state.json — the contract between skills

This file is read and updated by nearly every skill. Schema:

```json
{
  "ticket": "PROJ-1234",
  "ticket_text": "Add 5% loyalty discount for Gold-tier customers...",
  "phase": "implementation",
  "phase_status": "in_progress",
  "services": ["order-service", "payment-service", "notification-service"],
  "services_confirmed": true,
  "contracts_approved": true,
  "review_approved": false,
  "error_class": null,
  "iterations": { "integration_test": 0, "review": 0 },
  "max_iterations": 3,
  "acceptance": {
    "integration_test": "docker-compose up; all cross-service integration tests green",
    "review": "REVIEW.md verdict PASS: zero Critical findings (per-repo, security, cross-repo)"
  },
  "feedback_ref": null,
  "completed_phases": [
    "discovery",
    "workspace_setup",
    "contracts",
    "planning"
  ],
  "artifacts": {
    "contracts_dir": "contracts/",
    "plans": {
      "order-service": "order-service-plan.md",
      "payment-service": "payment-service-plan.md",
      "notification-service": "notification-service-plan.md"
    },
    "impl_reports": {},
    "review_report": null,
    "pr_plan": null
  },
  "merge_order": ["payment-service", "order-service", "notification-service"],
  "prs": {}
}
```

### Phase values

`discovery` → `workspace_setup` → `contracts` → `planning` → `implementation` → `integration_test` → `review` → `prs` → `cleanup` → `done`

### Who moves `phase`

Only the dispatcher (`springboot-feature-bootstrap`) moves `phase` to a different phase — forward
on `success`, back to `implementation` on `needs_repair`. A phase skill reports its outcome through
`phase_status` and may set `phase` only to its own phase, never the next one. The one exception
is `feature-cleanup`, which stamps `done` in the archived copy because it deletes the live
workspace. The full per-field ownership table is in
`springboot-feature-bootstrap/references/phase-dispatcher.md` ("State ownership").

### Phase status values

- `in_progress` — skill is currently working
- `success` — phase complete, acceptance condition met, ready to advance
- `needs_human` — paused for approval (gate) or escalation (budget exhausted / blocker)
- `needs_repair` — recoverable failure; dispatcher should loop back to the repair phase
- `failed` — blocking failure (`error_class="blocker"`); stop and escalate

### Feedback fields

These fields drive the bounded repair loops (see "Feedback loops" below):

- `error_class` — `"recoverable"`, `"blocker"`, or `null`. Classifies a non-success outcome.
- `iterations` — per-phase repair counter, e.g. `{ "integration_test": 1, "review": 0 }`.
- `max_iterations` — budget per loopable phase before the loop escalates to a human (default `3`).
- `acceptance` — the explicit, checkable termination condition per loopable phase. A phase is
  only `success` when its acceptance condition holds, not merely when the skill finishes.
- `feedback_ref` — path to the artifact a repair loop must consume (e.g. `REVIEW.md`, the failing
  test output), so the repair phase knows precisely what to fix.

### Feedback loops

Two phases are loopable: `integration_test` and `review`. Each has an `acceptance` condition.
When a loopable phase does not meet acceptance:

- If the miss is **recoverable** (tests fail, review has Critical findings, all fixable inside
  the approved contracts), the skill sets `phase_status="needs_repair"`,
  `error_class="recoverable"`, and `feedback_ref` to the artifact describing what to fix
  (`integration-results.md` or `REVIEW.md`). The dispatcher increments `iterations[phase]`,
  removes `implementation` and every later phase from `completed_phases`, and routes back to
  `implementation`; then the chain re-verifies forward.
- `parallel-implementation` sees a non-null `feedback_ref` and runs in **repair mode**: it writes
  a `<service>-repair-<N>.md` plan per affected service (one task per item, failing test first)
  and executes only those.
- A loopable phase that meets its acceptance condition sets `error_class` and `feedback_ref` to
  `null`. Nothing else clears them.
- When `iterations[phase] >= max_iterations`, the dispatcher stops looping and escalates
  (`phase_status="needs_human"`, `error_class="recoverable"`). The counters are per feature; only
  the user's "keep repairing" or "redo phase X" resets them.
- A **blocker** (missing dependency, a fix that needs an approved contract changed, infra
  failure) sets `phase_status="failed"`, `error_class="blocker"`. Blockers never auto-retry —
  they escalate immediately. The repair loop never edits contracts.

### Hard-gate flags

Three boolean fields gate the chain:

- `services_confirmed` — set by user after `service-discovery` presents proposal
- `contracts_approved` — set by user after `contract-first-design` presents contracts
- `review_approved` — set by user after `cross-service-review` finishes

The bootstrap will not advance past a gate until the flag is `true`.

## CLAUDE.md contents

Generated by `feature-workspace-setup`. Contains:

- Feature ticket text
- List of services in scope
- Branch name (`feature/<TICKET>`)
- Conventions (Maven test command, profile name, coding standards location)
- Service relationships (from catalog: who depends on whom)
- Endpoints in scope (from catalog: which endpoints are being added/modified)

Every subagent dispatched by `subagent-task-execution` reads this file first.

## Inter-skill data flow

```
service-discovery
    └─> writes: feature-state.json {services, services_confirmed=false}

feature-workspace-setup
    ├─> reads:  feature-state.json {services}
    └─> writes: CLAUDE.md, worktree directories

contract-first-design
    ├─> reads:  feature-state.json, ticket_text
    └─> writes: contracts/*.md, feature-state.json {contracts_approved=false}

writing-implementation-plan (called N times)
    ├─> reads:  contracts/*, CLAUDE.md
    └─> writes: <service>-plan.md

parallel-implementation → subagent-task-execution (N parallel streams)
    ├─> reads:  <service>-plan.md, contracts/*, CLAUDE.md
    │           repair mode: feature-state.json {feedback_ref} → the artifact it names
    └─> writes: code commits in worktree, <service>-impl-report.md
                repair mode: <service>-repair-<N>.md, appended impl-report sections

multi-service-integration-test
    ├─> reads:  all worktrees, contracts/*
    └─> writes: docker-compose.dev.yml, integration test code, integration-results.md,
                feature-state.json {phase_status, error_class, feedback_ref}

cross-service-review
    ├─> reads:  all worktree diffs, contracts/*, <service>-impl-report.md
    └─> writes: REVIEW.md, feature-state.json {review_approved=false, phase_status,
                error_class, feedback_ref}

multi-branch-merge → finishing-a-feature-branch (N times)
    ├─> reads:  REVIEW.md, feature-state.json {merge_order}
    └─> writes: PR_PLAN.md, feature-state.json {prs}

feature-cleanup
    ├─> reads:  feature-state.json {prs} (verifies all merged)
    └─> writes: archive in catalog/docs/feature-history/, removes worktrees
```

## Idempotency

Every skill should be safe to re-run on the same feature. Patterns:

- Check `completed_phases` before starting work. If your phase is in the list, refuse re-run unless the user explicitly asks to redo.
- For per-worktree skills, check whether the per-service artifact already exists. If yes, ask before overwriting.
- Repair-loop exception: a route-back removes `implementation` and later phases from `completed_phases`, so those re-runs pass the check above. Within the loop, verification reports (`integration-results.md`, `REVIEW.md`, per-repo reviews) are regenerated without asking, and repair runs append to impl reports rather than overwrite them.
- For state updates, prefer reading the whole file, updating fields, writing back — not partial appends.
