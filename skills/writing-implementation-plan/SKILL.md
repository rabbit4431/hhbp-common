---
name: writing-implementation-plan
description: Break an approved feature spec into a sequence of 2-5-minute tasks for one service, each with exact file paths, the failing test code, the minimal implementation, and a verification step. Use whenever a service in scope needs an implementation plan before code is written, or whenever the user says "write a plan for X", "break this down into tasks", "plan the implementation", "what are the steps for X". Invoke once per service in multi-service features — one plan per worktree. Plans should be detailed enough that an enthusiastic junior engineer with no project context could execute them.
---

# Writing an Implementation Plan

<when_to_use>
- A service has been confirmed in scope for a feature
- The contracts in `features/<TICKET>/contracts/` are approved
- The user asks to plan implementation: "write the plan for order-service," "break this down"
- Invoked by `parallel-implementation` per service

If `contracts_approved: false` in `feature-state.json`, stop and direct the user to approve contracts first. Planning before contracts produces work that will likely be redone.
</when_to_use>

<context>
The plan is the contract between this skill and the subagent that will execute it. The executing subagent has no project history. It cannot fill in what you didn't write. The level of detail below — concrete file paths, full test code, exact verification commands — exists because that's what removes ambiguity for the executor.
</context>

<required_skills>
- `docs-lookup` — to confirm current library/framework API usage before writing the test/impl code blocks the executor copies verbatim
</required_skills>

<output_contract>
- A markdown file at `<REPO_ROOT>/features/<TICKET>/<service>-plan.md`
- `feature-state.json` updated: `artifacts.plans.<service>` set to the plan path
</output_contract>

<granularity>
Each task should be 2-5 minutes of work for an experienced engineer.

<example>
Right-sized tasks:
- One new endpoint with its controller test = 1 task
- One new field on a DTO + the mapper changes = 1 task
- A new Kafka listener with its handler = 1-2 tasks
- A new repository method with its query = 1 task

Too coarse (split):
- "Implement the controller" — split per endpoint
- "Wire up the discount feature" — split per behavior

Too fine (merge):
- "Add the import statement" — fold into the task that uses it
- "Rename one variable" — fold into the surrounding task
</example>
</granularity>

<plan_template>
Each task in the plan uses this exact structure. The subagent and reviewer parse it.

````markdown
# <service> Implementation Plan: <TICKET>

> **For executors:** Run tasks in order. Each task is a complete RED-GREEN-COMMIT cycle (see the test-driven-development skill). Mark `- [x]` when done.

## Context

- Service: `<service>`
- Branch: `feature/<TICKET>`
- Contract files: `contracts/<file1>.md`, `contracts/<file2>.md`
- Worktree: `<REPO_ROOT>/features/<TICKET>/<service>/`

## Files map

- `src/main/java/.../OrderController.java` — adds POST /api/orders
- `src/main/java/.../OrderRequest.java` — new DTO
- `src/test/java/.../OrderControllerTest.java` — controller test
- (etc.)

## Tasks

### Task 1: <one-line description>

**Files:**
- Create: `src/test/java/.../DiscountServiceTest.java`
- Create: `src/main/java/.../DiscountService.java`

**Step 1 — Write the failing test:**
```java
// full test code, including imports, fixtures, assertions
```

**Step 2 — Run and confirm failure:**
```bash
./mvnw test -Dtest=DiscountServiceTest#calculateDiscount_goldTierOver100_returnsFivePercent
```
Expected: `cannot find symbol: class DiscountService` (compilation failure).

**Step 3 — Write minimum implementation:**
```java
// full impl code, smallest that makes the test pass
```

**Step 4 — Run and confirm pass:**
```bash
./mvnw test -Dtest=DiscountServiceTest#calculateDiscount_goldTierOver100_returnsFivePercent
```
Expected: `Tests run: 1, Failures: 0`.

**Step 5 — Commit:**
```bash
git add src/test/java/... src/main/java/...
git commit -m "test+feat(discount): gold tier over $100 returns 5%"
```

- [ ] Task 1 done
````
</plan_template>

<workflow>
Use TodoWrite.

### Step 1: Read the contracts

Read every file in `features/<TICKET>/contracts/` that touches this service (as producer or consumer). The contracts define what shapes to implement.

### Step 2: Write the files map

Before writing any tasks, list the full set of files that will be created or modified. One responsibility per file — if a single file would have two unrelated changes, split into two files.

### Step 3: Order tasks bottom-up

Order so each task's test can pass before the next runs:

1. Pure business logic services (no Spring context) — deepest
2. Repositories — next
3. Controllers and listeners (the boundary) — last

This order maximizes the chance each task passes independently and keeps the build green between commits.

### Step 4: Fill in each task completely

The executing subagent runs in a fresh context. For every task:

- Test code is complete — imports, fixtures, assertions, no placeholders
- Implementation code is the actual code, not a hint or pseudo-code
- The `-Dtest=` flag in the verification command names the exact test method

If you find yourself writing `// ... rest of impl ...` or `// follow existing pattern`, expand it into real code before saving.

If a task's test or implementation code uses a library/framework API you are not certain is current, use the docs-lookup skill before writing the code block — the executor copies it verbatim, so a stale API here propagates straight into the build.

### Step 5: Save and update state

Save to `<REPO_ROOT>/features/<TICKET>/<service>-plan.md`. Update `feature-state.json`:

```json
{
  "artifacts": {
    "plans": {
      "<service>": "<service>-plan.md"
    }
  }
}
```

### Step 6: Self-review

Read the plan back. Confirm:

- [ ] Every task has all 5 steps
- [ ] Every test has concrete assertions (no `assertNotNull` alone, no `// TODO`)
- [ ] Every implementation is concrete (no `// implement here`)
- [ ] Verification commands have exact `-Dtest=...` flags
- [ ] Tasks are ordered bottom-up
- [ ] No task exceeds ~5 minutes
- [ ] Files map matches files referenced in tasks (no orphans, no missing)

Fix any unchecked items before declaring the plan done.
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| "Add POST /api/orders that returns 201 with discount" | "Implement the controller" |
| Complete code in test/impl blocks | `// fill in the rest` |
| Task 3 uses Task 1's helper (already written) | Task 3 uses Task 5's helper (doesn't exist yet) |
| One commit per behavior | One commit per task with three unrelated changes |
| Step 2 output specified | Step 2 omitted because "obviously it fails" |
| Plan scope = one service | Plan scope drifts into "and then in the other service…" |
</anti_patterns>

<output_format>
When the plan is saved, output:

> Plan written: `features/<TICKET>/<service>-plan.md` — N tasks, ~T minutes total. State updated.

If invoked by `parallel-implementation`, this is the entire visible output. The orchestrator will continue.
</output_format>
