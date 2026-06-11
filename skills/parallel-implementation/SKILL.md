---
name: parallel-implementation
description: Orchestrate multi-service feature implementation — owns all requests to implement, write code, or start coding across services once contracts are approved. Fires on "implement this feature", "write the code", "start the implementation", "execute across all services", or any request to begin coding work for a feature, regardless of whether the user asks for parallel or sequential execution. Invoked by springboot-feature-bootstrap as phase 5. Internally runs writing-implementation-plan per service then subagent-task-execution per service; enforces parallel dispatch even if the user requests sequential.
---

# Parallel Implementation

<when_to_use>
- `feature-state.json` shows `contracts_approved: true` and `phase: planning` or `implementation`
- The user wants implementation work to begin
- Invoked by `springboot-feature-bootstrap` as phase 5

If contracts are not yet approved, stop. Phase 5 starts only after phase 3 is gated open.
</when_to_use>

<context>
N services × M tasks means a large subagent fan-out. The work parallelizes well because services don't share files mid-implementation — that's exactly what contracts buy. The orchestration here ensures plans exist before any code is written (cross-cutting plan changes are cheap; cross-cutting code changes are not) and that streams run in parallel rather than serial.
</context>

<required_skills>
- `writing-implementation-plan` — one plan per service (phase 4)
- `subagent-task-execution` — one stream per worktree (phase 5)
- Transitively: `test-driven-development`, `code-review-request`
</required_skills>

<output_contract>
- Each service has a plan at `<REPO_ROOT>/features/<TICKET>/<service>-plan.md`
- Each plan is fully executed: tests pass, commits made, plan marked done
- Each service has an impl report at `<service>-impl-report.md`
- `feature-state.json` updated: `phase: integration_test`
</output_contract>

<workflow>
Use TodoWrite to track per-service progress in each sub-phase.

### Phase 4a: Plan every service

For each service in `feature-state.json.services` (every service, not just the first), invoke `writing-implementation-plan`.

These can run in parallel — plans don't depend on each other. When the harness supports parallel `Task` dispatch, dispatch N planning subagents in the same turn. Calling them sequentially when parallel is available wastes wall-clock time.

Wait until every plan exists at `<service>-plan.md` and `feature-state.json.artifacts.plans.<service>` is set. Only then proceed.

If any plan fails or the user wants to revise it, pause. Cross-cutting plan changes get expensive once any service starts executing — better to fix plans now.

### Phase 4b: Soft pause

Briefly surface plan filenames:

> Plans drafted:
> - `features/<TICKET>/order-service-plan.md` — 7 tasks
> - `features/<TICKET>/payment-service-plan.md` — 5 tasks
>
> Proceeding to implementation. Reply "stop" if you want to review plans first.

This is a soft pause — proceed unless the user says stop. A 30-second sanity check costs little and catches obviously-wrong plans before subagent cost compounds.

### Phase 5: Implement every service in parallel

For each service (every service, not just the first), dispatch `subagent-task-execution` against the worktree and plan. Streams run in parallel.

Each stream operates within its worktree only. Each stream relies on the contracts for what other services will produce — the contract is the source of truth during implementation. If a stream finds the contract is wrong (a service genuinely needs something the contract doesn't specify), stop the world: surface to the user, fix the contract, re-plan if needed.

#### Dispatching the streams

When the harness supports parallel `Task` dispatch:

<example>
```
For service in services:
  Task: invoke subagent-task-execution
    args:
      worktree: features/<TICKET>/<service>
      plan: features/<TICKET>/<service>-plan.md
      service_name: <service>
      review_mode: full   # or as configured
```
</example>

All N dispatch in the same turn. The orchestrator monitors completion.

When the harness is sequential-only: run in dependency order (`feature-state.json.merge_order` if set; otherwise contract producers first). Note in the report that streams were serialized — this is a degraded mode.

### Phase 5a: Per-stream completion

When a stream completes, verify:
- The impl report exists for that service
- `feature-state.json.artifacts.impl_reports.<service>` is set
- The worktree has the expected commits (`git log feature/<TICKET> --oneline`)

When every stream completes (not just the first): proceed to Phase 5b.

If any stream fails:
- Do not proceed to integration test
- Surface the failure (which service, which task)
- Other services' work remains committed in their worktrees (no rollback)
- The user decides: fix and resume, or roll back the feature

### Phase 5b: Advance state

```json
{
  "phase": "integration_test",
  "phase_status": "success",
  "completed_phases": [..., "planning", "implementation"],
  "artifacts": {
    "plans": {...},
    "impl_reports": {
      "<service-1>": "<service-1>-impl-report.md",
      ...
    }
  }
}
```

### Phase 5c: Report

> Implementation complete for `<TICKET>`. <N> services:
> - `order-service`: 7 tasks, 7 commits
> - `payment-service`: 5 tasks, 5 commits
> - `notification-service`: 3 tasks, 3 commits
>
> Next phase: integration test.
</workflow>

<subagent_budget>
For a 3-service feature with 5 tasks each at default `review_mode: full`:

- 3 planning subagents
- 15 implementer subagents
- 15 spec-compliance reviewer subagents
- 15 quality reviewer subagents
- **= 48 subagents total**

With `review_mode: spec_only`: 33 subagents.
With `review_mode: none`: 18 subagents (use only for trivial features — review discipline is lost).

Default is `full`. Override only when caller specifies otherwise.
</subagent_budget>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| All N plans exist before any implementation | Implementation starts after only some plans exist |
| Each stream uses contracts for cross-service shapes | Streams talk to each other mid-implementation |
| Failed stream → surface to user → user decides | Auto-retry a failed stream |
| Soft pause before implementation | Skip the soft pause to save 30 seconds |
| Parallel `Task` dispatch | Sequential when parallel is available |
| Verify commits exist per stream | Assume "completed" means committed |
</anti_patterns>

<output_format>
Conductor's summary only:

- Phase 4 start: "Drafting N plans in parallel..."
- Phase 4 done: list of plan files
- Phase 5 start: "Implementing N services in parallel..."
- Per-stream completion: "<service> stream done: X tasks committed"
- Phase 5 done: the Phase 5c report

Substantive work output lives in the per-service impl reports.
</output_format>
