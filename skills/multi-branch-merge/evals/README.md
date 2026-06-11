# Evals: multi-branch-merge

> **STATUS: SCAFFOLD.** Trigger and behavior eval JSONs need to be populated before this skill can be trained.

## Files (to be authored)

- `trigger-eval.json` — when should this skill fire?
- `behavior-eval.json` — when fired, what should it produce?

## Running

```bash
./run-trigger.sh
./run-behavior.sh
```

(Both delegate to `../../test-driven-development/evals/`'s runners.)

See `../../service-discovery/evals/` or `../../test-driven-development/evals/` for exemplar JSONs.
