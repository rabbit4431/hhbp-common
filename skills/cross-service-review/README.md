# cross-service-review

> **STATUS: SCAFFOLD ONLY.**

Domain skill. Cross-repo correctness review: contract drift, correlation IDs, error parity.

## What it does

Cross-repo correctness review: contract drift, correlation IDs, error parity.

## When it fires

(See the description in SKILL.md for trigger phrases.)

## Bundled resources

(To be authored. See `references/` and `scripts/` folders.)

## Calls into other skills

code-review-request (per worktree for the per-repo pass)

## Training this skill

Once the SKILL.md body is authored, fill in:
- `evals/trigger-eval.json` — positive and negative cases
- `evals/behavior-eval.json` — input → expected output assertions
- `evals/run-trigger.sh` and `evals/run-behavior.sh` (delegate to test-driven-development's runner)

See `../../docs/training-loop.md` for the iteration process.

## Version

v0 (scaffold, domain, cross-service-review)
