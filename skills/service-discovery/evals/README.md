# Evals: service-discovery

## Files

- `trigger-eval.json` — does the skill fire on multi-service feature tickets?
- `behavior-eval.json` — when it fires, does it seed from CLAUDE.md, verify live, produce a
  categorized rationale citing both, and pause for human approval?
- `run-trigger.sh` — runs trigger eval
- `run-behavior.sh` — runs behavior eval against a fixture workspace

## Running

```bash
./run-trigger.sh
./run-behavior.sh
```

## Fixtures

Behavior evals need a fixture **workspace** (a small CLAUDE.md hierarchy over sample repos), not a
catalog DB:

```
fixtures/workspace/standard-estate/
  CLAUDE.md                      # L0 — maps domains to the sample repos
  <repo>/CLAUDE.md               # L1 — service index
  <repo>/<service>/CLAUDE.md     # L2 — Owns / Does NOT own / Talks to
  <repo>/<service>/src/...       # enough live code for grep to confirm/deny
fixtures/workspace/no-claude-md/ # same repos, CLAUDE.md files removed (missing-context case)
```

The estate covers `orders`, `payments`, `customer`, `notification`, `loyalty`, and `inventory`
domains with realistic Feign/MQ relationships, so the dependency hop has something to find.

## Iteration

| Failure | Fix |
|---|---|
| Returns a flat list instead of three buckets | Strengthen "three sections" language in Step 5/6 |
| Picks services by name rather than evidence | Add a worked example showing CLAUDE.md + grep citation |
| Trusts the card, misses drift | Reinforce Step 3: grep every identifier; mismatch is a finding |
| Auto-advances without confirmation | Strengthen hard-gate language; reference downstream rejection |
| Misses downstream consumers | Step 4 dependency hop skipped — make it a separate todo |
| Missing-CLAUDE.md case doesn't warn | Ensure `<missing_context>` fallback + warning is in the body |
| Vague-ticket case doesn't ask | Reinforce "if Step 1 can't extract content nouns, STOP and ask" |

## Adding new cases

If you observe a real-world miss (a service you missed, or one named that wasn't involved), add the
ticket as a new behavior eval case. This builds the suite into a regression test for every miss.
