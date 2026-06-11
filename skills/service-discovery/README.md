# service-discovery

Domain skill. Identifies which of the 50+ Spring Boot services (across freight35, user-center,
channel-center, pay-center) need changes for a feature ticket — by reading the CLAUDE.md hierarchy,
then verifying against the live code.

## What it does

Takes a ticket, seeds candidates from the CLAUDE.md hierarchy (L0 workspace -> L1 repo index ->
L2 service cards), verifies ownership with live agentic search, walks one dependency hop (Feign +
live Nacos), and produces a categorized list (definitely / likely / possibly in scope) with a
written rationale that cites both the card and the grep. Requires explicit human confirmation
before advancing.

## When it fires

- User mentions a multi-service ticket
- User asks "which services touch X" / "what services do I need to change"
- Invoked by `springboot-feature-bootstrap` as phase 1
- User starts feature work in a vague domain ("I need to add a discount feature")

## When it does NOT fire

- User names a single specific service ("update OrderController")
- User asks a general question without feature context ("show me all payment services")
- Read-only dependency query ("what does payment-service depend on")

## Bundled resources

- `references/agentic-search.md` — live grep patterns (endpoints, MQ consumers, Feign deps, entities)
- `references/claude-md-hierarchy.md` — how L0/L1/L2 map to discovery + the live Nacos query
- `scripts/categorize-results.sh` — buckets search results into definitely/likely/possibly

## Why no catalog

A pre-built service catalog (svc CLI / catalog.db) goes stale between regenerations and silently
returns renamed/deleted services. This skill instead reads the CLAUDE.md hierarchy (durable,
co-located, updated in the same PRs as the code) for routing, and confirms the volatile specifics
with live search. The live tree is always fresh; an index is not. If a repo has no CLAUDE.md,
discovery falls back to pure agentic search and recommends creating the card.

## Training this skill

### Trigger eval

```bash
./evals/run-trigger.sh
```

Positive cases: feature-shaped requests with ticket IDs, multi-service phrasing, domain-without-
service phrasing. Negative cases: single-service requests, read-only dependency queries, counting
questions.

### Behavior eval

Checks for:
- `discovery-rationale.md` created with the three buckets **and** an `## Evidence` section citing
  both CLAUDE.md and live grep
- `feature-state.json` created with `services_confirmed: false`
- The dependency hop ran (Talks-to + Nacos)
- The skill paused for user confirmation (didn't auto-advance the phase)
- Missing-CLAUDE.md case falls back to live search and warns

### Common failure modes and fixes

| Failure | Fix |
|---|---|
| Returns a flat list without categorization | Strengthen "three sections" requirement in Step 5/6 |
| Picks services by name, not evidence | Add to anti-patterns; show what a CLAUDE.md + grep citation looks like |
| Trusts the card for exact endpoints (misses drift) | Reinforce Step 3: card routes, grep proves; treat mismatch as a finding |
| Auto-advances without confirmation | Strengthen hard-gate language; reference downstream rejection |
| Misses downstream consumers | Step 4 dependency hop skipped — make it a separate todo |
| No CLAUDE.md and the skill stalls | Ensure `<missing_context>` fallback to pure agentic search is followed |

## Version

v2 (2026-06-03) — CLAUDE.md-hierarchy-first; catalog removed.
