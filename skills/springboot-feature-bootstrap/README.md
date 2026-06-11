# springboot-feature-bootstrap

Bootstrap. Orchestrates the 8 phase-level skills end-to-end for a multi-service Spring Boot feature.

## What it does

Entry point. Recognizes a multi-service ticket, initializes `feature-state.json`, then walks the 9 phases by invoking the right sub-skill at each step. Pauses at 3 hard gates for human approval. Resumes from state file if interrupted.

## When it fires

- User pastes a multi-service ticket
- User says "start a new feature," "kick off PROJ-XXXX," "begin work on this requirement"
- User pastes any ticket text mentioning more than one domain or service

## When it does NOT fire

- Single-service feature work (other skills can be invoked directly)
- Continuation of an in-flight feature where the user names a specific phase
- Pure catalog questions, code questions, debugging

## Bundled resources

- `references/chain-diagram.md` — full chain diagram of which skill runs when
- `references/phase-dispatcher.md` — decision logic for "what to invoke next given current state"

## Training this skill

### Trigger eval

```bash
./evals/run-trigger.sh
```

Positive cases: ticket-shaped multi-service requests. Negative cases: single-service, knowledge questions, debugging.

### Behavior eval

Checks the full chain on a fixture multi-service feature:
- `feature-state.json` was initialized correctly
- Each phase was invoked in order
- Hard gates paused the chain at the right points
- Failure in a sub-skill stopped the chain rather than auto-advanced
- Resume after interruption picks up from `completed_phases`

### Common failure modes and fixes

| Failure | Fix |
|---|---|
| Bootstrap does the work itself instead of invoking sub-skills | Strengthen the "you are an orchestrator" language. Add an example of a turn that does too much. |
| Skips a hard gate when user says something ambiguous like "looks good" | Tighten the gate language. "Ambiguous = approved" is the right interpretation, but only for clearly positive ambiguity. Define examples. |
| Advances past a `failed` phase | Add stronger language: "STOP means stop. Auto-retry is forbidden." |
| Re-runs completed phases on resume | The completed_phases check is being skipped. Make it a separate todo item. |
| Talks too much (long output per phase) | Add the "be terse" anti-pattern example. The sub-skills are the substantive content. |
| Doesn't initialize feature-state.json before invoking phase 1 | Step 1 ordering issue — make initialization explicitly the first action. |

## Version

v1 (2026-05-14)
