# Chain Diagram

The full picture of which skills the bootstrap orchestrates.

```
USER: pastes ticket text

  │
  ▼
┌──────────────────────────────────────┐
│ springboot-feature-bootstrap         │ ← this skill
│ (initializes feature-state.json)     │
└──────────────────────────────────────┘
  │
  ▼ phase 1: discovery
┌──────────────────────────────────────┐
│ service-discovery                    │
│ → discovery-rationale.md             │
│ → services_confirmed: false          │
└──────────────────────────────────────┘
  │
  ⏸ HARD GATE: user approves scope
  │
  ▼ phase 2: workspace_setup
┌──────────────────────────────────────┐
│ feature-workspace-setup              │
│ → N worktrees + CLAUDE.md            │
└──────────────────────────────────────┘
  │
  ▼ phase 3: contracts
┌──────────────────────────────────────┐
│ contract-first-design                │
│ → contracts/*.md                     │
│ → contracts_approved: false          │
└──────────────────────────────────────┘
  │
  ⏸ HARD GATE: user approves contracts
  │
  ▼ phase 4: planning
┌──────────────────────────────────────┐
│ writing-implementation-plan ×N       │
│ → <service>-plan.md per service      │
└──────────────────────────────────────┘
  │
  ▼ phase 5: implementation
┌──────────────────────────────────────┐
│ parallel-implementation              │
│ → subagent-task-execution per worktree
│   → test-driven-development per task │
│   → code-review-request per task     │
│ → code + tests committed             │
└──────────────────────────────────────┘
  │
  ▼ phase 6: integration_test
┌──────────────────────────────────────┐
│ multi-service-integration-test       │
│ → docker-compose.dev.yml + tests     │
└──────────────────────────────────────┘
  │
  ▼ phase 7: review
┌──────────────────────────────────────┐
│ cross-service-review                 │
│ → code-review-request ×N (per repo)  │
│ → cross-repo pass                    │
│ → REVIEW.md                          │
│ → review_approved: false             │
└──────────────────────────────────────┘
  │
  ⏸ HARD GATE: user approves review
  │
  ▼ phase 8: prs
┌──────────────────────────────────────┐
│ multi-branch-merge                │
│ → finishing-a-feature-branch ×N      │
│   (in merge_order)                   │
│ → PR_PLAN.md, N PRs opened           │
└──────────────────────────────────────┘
  │
  ▼ phase 9: cleanup (after PRs merged)
┌──────────────────────────────────────┐
│ feature-cleanup                      │
│ → worktrees removed                  │
│ → feature archived in catalog history│
└──────────────────────────────────────┘
  │
  ▼
DONE
```

## Skill dependencies

Some skills call other skills directly (not via the bootstrap). The bootstrap doesn't need to manage these — they happen inside the parent skill:

- `parallel-implementation` internally calls:
  - `writing-implementation-plan` (if plans missing)
  - `subagent-task-execution` (one stream per worktree)
- `subagent-task-execution` internally calls:
  - `test-driven-development` (per task)
  - `code-review-request` (per task)
- `multi-service-integration-test` internally calls:
  - `test-driven-development` (for the integration tests)
- `cross-service-review` internally calls:
  - `code-review-request` (per repo)
- `multi-branch-merge` internally calls:
  - `finishing-a-feature-branch` (per worktree)

The bootstrap only invokes the eight phase-level skills. The foundation skills are reached transitively.
