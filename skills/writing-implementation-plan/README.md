# writing-implementation-plan

> **STATUS: SCAFFOLD ONLY.**

Foundation skill. Convert an approved contract + scoped service into a sequence of 2-5-minute tasks, each with exact file paths, expected code shape, and a verification step.

## What it does

Convert an approved contract + scoped service into a sequence of 2-5-minute tasks, each with exact file paths, expected code shape, and a verification step.

## When it fires

(See the description in SKILL.md for trigger phrases.)

## Bundled resources

(To be authored. See `references/` and `scripts/` folders.)

## Calls into other skills

(none — leaf foundation skill)

## Training this skill

Once the SKILL.md body is authored, fill in:
- `evals/trigger-eval.json` — positive and negative cases
- `evals/behavior-eval.json` — input → expected output assertions
- `evals/run-trigger.sh` and `evals/run-behavior.sh` (delegate to test-driven-development's runner)

See `../../docs/training-loop.md` for the iteration process.

## Version

v0 (scaffold, foundation, writing-implementation-plan)
