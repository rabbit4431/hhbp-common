# multi-branch-merge

> **STATUS: SCAFFOLD ONLY.**

Domain skill. N-PR coordination with dependency-aware merge order.

## What it does

N-PR coordination with dependency-aware merge order.

## When it fires

(See the description in SKILL.md for trigger phrases.)

## Bundled resources

(To be authored. See `references/` and `scripts/` folders.)

## Calls into other skills

finishing-a-feature-branch (per worktree, in merge_order)

## Training this skill

Once the SKILL.md body is authored, fill in:
- `evals/trigger-eval.json` — positive and negative cases
- `evals/behavior-eval.json` — input → expected output assertions
- `evals/run-trigger.sh` and `evals/run-behavior.sh` (delegate to test-driven-development's runner)

See `../../docs/training-loop.md` for the iteration process.

## Version

v0 (scaffold, domain, multi-branch-merge)
