# Architecture

How the 14 skills compose into a chain.

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
  6. cross-service-review
  7. multi-branch-merge
  8. feature-cleanup
```

## Phase sequence

```
1. discovery        → service-discovery
2. workspace_setup  → feature-workspace-setup
3. contracts        → contract-first-design
4. planning         → writing-implementation-plan (×N services)
5. implementation   → parallel-implementation
                       └─> subagent-task-execution (×N parallel streams)
                             └─> test-driven-development (per task)
                             └─> code-review-request (per task)
6. integration_test → multi-service-integration-test
                       └─> test-driven-development
7. review           → cross-service-review
                       └─> code-review-request (×N)
8. prs              → multi-branch-merge
                       └─> finishing-a-feature-branch (×N in dep order)
9. cleanup          → feature-cleanup
```

## Hard gates

Three points where the chain pauses for human approval, enforced by flags in `feature-state.json`:

- After phase 1 — `services_confirmed`
- After phase 3 — `contracts_approved`
- After phase 7 — `review_approved`

## Foundation skill reuse

Foundation skills are reusable outside the multi-service chain. Examples:

- `test-driven-development` on any Java/Maven project
- `writing-implementation-plan` for any feature, single-service or multi
- `subagent-task-execution` for any plan-driven work
- `code-review-request` for any branch
- `finishing-a-feature-branch` for any worktree

Measuring foundation-skill reuse on single-service work is one of the success criteria. If they aren't getting reused, we over-engineered them.

## Why this split

Domain skills know things only this org's Spring Boot setup knows: the service catalog, the contract format, the docker-compose topology, the dependency-aware merge order.

Foundation skills know things any Java engineer knows: how to write a failing test first, how to dispatch a subagent, how to write a plan with 2-5-minute tasks, how to finish a branch.

If we coupled them, we couldn't reuse the foundation skills on single-service work, and we'd have to retest them every time the multi-service flow changed.

See `docs/wire-protocol.md` for how the skills communicate at runtime.
