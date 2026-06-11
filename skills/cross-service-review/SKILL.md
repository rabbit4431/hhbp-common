---
name: cross-service-review
description: Review all worktree diffs together as one feature, catching contract drift, log/correlation inconsistencies, and error-handling mismatches across services that single-repo review cannot see. Use whenever a multi-service feature is implementation-complete and integration tests pass, or whenever the user says "review this feature", "check the diffs before PRs", "cross-repo review". Invoked by springboot-feature-bootstrap as phase 7. This is the last quality gate before PRs open — distinct from per-repo review (handled by code-review-request), this skill only checks cross-repo concerns.
---

# Cross-Service Review

<when_to_use>
- All in-scope services have implementation reports
- Integration tests have passed
- `feature-state.json` shows `phase: review`
- Invoked by `springboot-feature-bootstrap` as phase 7
</when_to_use>

<context>
Per-repo review catches per-repo issues. The drift between services — one side serializes the field as camelCase, the other expects snake_case; one logs with `orderId`, the other with `order_id`; one returns 404 on missing, the other returns 200 with `null` — only shows up when both sides are read together.

This skill does that read. It dispatches per-repo reviews first (via `code-review-request`) as a baseline, then does a fresh-context cross-repo pass focused on the four bug classes that integration tests catch only incidentally and unit tests don't catch at all: contract drift, correlation/observability parity, error parity, naming/serialization parity.
</context>

<required_skills>
- `code-review-request` — for the per-repo pass on each worktree
</required_skills>

<output_contract>
- A per-repo review report per worktree (typically `<service>-review.md`)
- A cross-repo review at `<REPO_ROOT>/features/<TICKET>/REVIEW.md`
- `feature-state.json` updated: `review_approved: false`, `phase_status: needs_human`
- The chain pauses; the user must explicitly approve before PRs open
</output_contract>

<workflow>
Use TodoWrite. Two phases: per-repo reviews (parallel), then cross-repo review (single fresh pass).

### Phase A: Per-repo reviews

For every worktree (not just the first), dispatch `code-review-request` with the worktree diff as scope.

```
For service in services:
  Task: code-review-request
    args:
      scope: features/<TICKET>/<service> diff vs origin/main
      contract: features/<TICKET>/contracts/*<service>*
      output_path: features/<TICKET>/<service>-review.md
```

Parallel dispatch when supported. Wait for all to complete before Phase B.

If any per-repo review verdict is BLOCK with Critical findings, surface to the user immediately:

> Per-repo review for `<service>` returned BLOCK with N Critical findings. Fix these before continuing to cross-repo review.

The chain doesn't proceed until per-repo Critical findings are resolved.

### Phase B: Cross-repo review

Dispatch a fresh subagent with a cross-repo-specific review prompt:

<example>
```
You are reviewing a multi-service feature across N worktrees. Your context is fresh.

# Feature
<TICKET>: <ticket text>

# Worktrees
- features/<TICKET>/order-service/
- features/<TICKET>/payment-service/
- features/<TICKET>/notification-service/

# Contracts
[content of every file in features/<TICKET>/contracts/]

# Per-repo reviews already done
[paste each <service>-review.md output]

# Your job
You are NOT repeating the per-repo reviews. You are checking the four bug classes
that only show up when reading both sides of every contract together:

1. **Contract drift** — does the producer actually produce what the contract says?
   Does the consumer actually accept what the contract says? Field names,
   types, optionality, enum values.

2. **Observability parity** — does the correlation ID actually propagate across
   the call? Do both sides log it consistently? Are metrics consistent
   (the same operation counted the same way on both sides)?

3. **Error parity** — for every error case in the contract, does the producer
   actually return it? Does the consumer actually handle it the way the contract
   says? Look for cases where the consumer's error handler doesn't match what
   the producer can return.

4. **Naming/serialization parity** — JSON casing, date formats, enum string
   values, ID formats. Subtle mismatches that pass integration tests when
   defaults align but break in production with edge values.

Report every finding you observe, including low-confidence ones. A separate
triage step will rank and filter them. Coverage matters more than filtering
at this stage.

For each finding:
- The two services involved
- File paths and line numbers on both sides
- The contract reference
- A concrete suggested fix
- Severity: Critical / Major / Minor / Style
- Confidence: High / Medium / Low

End with a verdict: PASS (no Critical) or BLOCK (one or more Critical).
```
</example>

### Phase C: Write the cross-repo review report

Write to `<REPO_ROOT>/features/<TICKET>/REVIEW.md`:

<example>
```markdown
# Cross-Service Review: PROJ-1234

**Verdict: BLOCK**

## Per-repo verdicts
- order-service: PASS
- payment-service: PASS
- notification-service: PASS

## Cross-repo findings

### Critical (1)
- **Contract drift: order-service → notification-service**
  - Contract specifies `discountAmount: number` in `order.created` payload
  - Producer (`order-service/.../OrderEventPublisher.java:34`) sends `discount: number`
  - Consumer (`notification-service/.../OrderEventListener.java:21`) reads `discountAmount` — will be null
  - Fix: align field name. Recommend `discountAmount` per contract.
  - Confidence: High

### Major (2)
- **Observability: correlation ID not propagated on Kafka path**
  - REST path propagates `X-Correlation-ID` correctly
  - Kafka producer (`order-service/.../OrderEventPublisher.java:38`) does not add correlation ID to headers
  - Consumer (`notification-service/.../OrderEventListener.java`) has no header read
  - Fix: add correlation ID to Kafka headers in producer, read in consumer.
  - Confidence: High

### Minor (1)
- ...

### Style (0)
- No findings at Style.

## Per-repo reviews (full text)
[paste or link]
```
</example>

### Phase D: Set up the hard gate

```json
{
  "phase": "review",
  "phase_status": "needs_human",
  "review_approved": false,
  "artifacts": {
    "review_report": "REVIEW.md",
    "per_repo_reviews": {
      "<service-1>": "<service-1>-review.md",
      ...
    }
  }
}
```

### Phase E: Present and pause

> Cross-service review complete for `<TICKET>`. Verdict: <PASS | BLOCK>.
>
> See `features/<TICKET>/REVIEW.md` for the full report.
>
> <If BLOCK> Critical findings need to be fixed before PRs open.
> <If PASS> Reply "approved" to proceed to opening PRs.

On approval (explicit "approved", "yes", or unambiguous positive):

```json
{
  "review_approved": true,
  "phase_status": "success",
  "completed_phases": [..., "review"]
}
```
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Per-repo + cross-repo in two distinct passes | Single pass mixing both |
| Cross-repo subagent reads contracts AND both sides | Cross-repo subagent reads only the diff |
| Surface every finding with confidence | Filter low-confidence findings at the finding stage |
| Treat "approved" as approval | Treat 👍 as approval |
| Block on Critical findings | Advance with Critical findings in the report |
| Cross-repo scope = contract drift + observability + error + serialization | Cross-repo scope = "anything that looks off" |
</anti_patterns>

<output_format>
On draft:

> Cross-service review for `<TICKET>`: <verdict>. Review at `features/<TICKET>/REVIEW.md`. Awaiting approval.

On approval:

> Review approved for `<TICKET>`. Next phase: PRs.
</output_format>
