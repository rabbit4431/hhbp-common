# Architecture

How the 18 skills compose into a chain.

## Three categories

```
┌────────────────────────────────────────────────────────────────────┐
│                  springboot-feature-bootstrap                      │
│              (entry point — orchestrates the chain)                │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        ▼                                             ▼
  DOMAIN SKILLS                              FOUNDATION SKILLS
  (Spring-Boot-specific)                     (general engineering)

  1. service-discovery                       A. test-driven-development
  2. feature-workspace-setup                 B. writing-implementation-plan
  3. contract-first-design                   C. subagent-task-execution
  4. parallel-implementation                 D. code-review-request
  5. multi-service-integration-test          E. finishing-a-feature-branch
  6. cross-service-review                     F. docs-lookup
  7. multi-branch-merge                       G. security-review
  8. feature-cleanup
  9. generate-api      (codegen, used in implementation)
 10. generate-code     (codegen, used in implementation)
```

## Phase sequence

```
1. discovery        → service-discovery
2. workspace_setup  → feature-workspace-setup
3. contracts        → contract-first-design
                       └─> docs-lookup (verify current library/framework API shapes)   [cross-cutting]
4. planning         → writing-implementation-plan (×N services)
                       └─> docs-lookup (confirm up-to-date API usage)                   [cross-cutting]
5. implementation   → parallel-implementation
                       └─> subagent-task-execution (×N parallel streams)
                             └─> test-driven-development (per task)
                             └─> generate-api / generate-code (write code to internal standards; answers from plan + contracts)
                             └─> docs-lookup (current API references while coding)       [cross-cutting]
                             └─> code-review-request (per task)
6. integration_test → multi-service-integration-test
                       └─> test-driven-development
                       └─ fail (recoverable) ─▶ back to 5. implementation   [bounded repair loop]
7. review           → cross-service-review
                       └─> code-review-request (×N)
                       └─> security-review (×N; blocking findings count toward the review acceptance condition)
                       └─ blocking findings ─▶ back to 5. implementation ─▶ re-run 6, 7   [bounded repair loop]
8. prs              → multi-branch-merge
                       └─> finishing-a-feature-branch (×N in dep order)
9. cleanup          → feature-cleanup
```

## Hard gates

Three points where the chain pauses for human approval, enforced by flags in `feature-state.json`:

- After phase 1 — `services_confirmed`
- After phase 3 — `contracts_approved`
- After phase 7 — `review_approved`

## Feedback loops

The chain is not purely forward. Two phases — `integration_test` (6) and `review` (7) — are
**loopable**: each has an explicit acceptance condition and, on a recoverable miss, routes back
to `implementation` (5) to fix and re-verify, bounded by a `max_iterations` budget (default 3).

- **Recoverable** miss (tests fail, review finds blocking issues) → bounded repair loop back to
  implementation, then re-run forward. The `review` loop runs *before* the `review_approved`
  gate, so the human sees a clean result or an escalation — not raw findings.
- **Budget exhausted** (max_iterations reached) → escalate to the human (`needs_human`).
- **Blocker** (missing dependency, ambiguous contract, infra) → stop and escalate; never
  auto-retried.

Blocking `security-review` findings (phase 7) are part of the `review` acceptance condition — REVIEW.md
must have zero blocking findings — so they route back through the same bounded repair loop as any other
blocking review finding. No new loop mechanism: security-review adds a finding source, not a phase.

This maps the chain onto the loop patterns it already half-implements: Plan-Execute-Verify (the
macro sequence), Retry (the bounded repair loop), and Human-in-the-Loop (the gates plus
escalation). The escalation reuses the existing gate/`needs_human` mechanism. Non-goal: the
chain stays human-gated for the three approval points — it is not fully autonomous. The state
fields and dispatcher logic that drive these loops are specified in `wire-protocol.md`
("Feedback loops") and `springboot-feature-bootstrap/references/phase-dispatcher.md`.

## Foundation skill reuse

Foundation skills are reusable outside the multi-service chain. Examples:

- `test-driven-development` on any Java/Maven project
- `writing-implementation-plan` for any feature, single-service or multi
- `subagent-task-execution` for any plan-driven work
- `code-review-request` for any branch
- `finishing-a-feature-branch` for any worktree
- `docs-lookup` on any project with the Context7 MCP, for any library/framework/API question
- `security-review` on any branch touching auth, input handling, secrets, or new endpoints

`generate-api` and `generate-code` are domain skills, but they also run **standalone and interactive**
for single-service or ad-hoc codegen — outside the chain they prompt for the architecture mode, API
shape, and business logic the plan and contracts otherwise supply.

Measuring foundation-skill reuse on single-service work is one of the success criteria. If they aren't getting reused, we over-engineered them.

## Why this split

Domain skills know things only this org's Spring Boot setup knows: the service catalog, the contract format, the docker-compose topology, the dependency-aware merge order. `generate-api` and `generate-code` belong here too — they encode this org's internal Spring DDD codegen standards (DDD vs Simple layout, `backend-development-standards.md`, the AppService orchestration order).

Foundation skills know things any Java engineer knows: how to write a failing test first, how to dispatch a subagent, how to write a plan with 2-5-minute tasks, how to finish a branch. `docs-lookup` (fetch current library docs) and `security-review` (general security checklist) are the same kind of general knowledge — useful on any project, not just this multi-service chain.

If we coupled them, we couldn't reuse the foundation skills on single-service work, and we'd have to retest them every time the multi-service flow changed.

See `docs/wire-protocol.md` for how the skills communicate at runtime.
