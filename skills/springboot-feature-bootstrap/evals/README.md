# Evals: springboot-feature-bootstrap

This is the orchestrator skill. Its evals are heavier than other skills because each behavior case may simulate multiple phases.

## Files

- `trigger-eval.json` — does the skill fire on multi-service feature requests?
- `behavior-eval.json` — does the orchestration work? (state init, phase ordering, hard-gate enforcement, failure stop, resume)
- `run-trigger.sh` — runs trigger eval
- `run-behavior.sh` — runs behavior eval against mock sub-skills (`fixtures/mock-skills/`)

## Running

```bash
./run-trigger.sh
./run-behavior.sh
```

## Behavior eval fixtures

Each case runs in a fresh git repo that serves as `REPO_ROOT` (kept afterwards under `$HHBP_EVAL_WORKSPACE/<case-id>/`, default `/tmp/bootstrap-eval-workspace`, with its `transcript.jsonl`). Most cases use a `pre_state` to simulate the bootstrap arriving mid-chain. The runner:

1. Installs the nine phase skills from `fixtures/mock-skills/` as project skills in the workspace
2. Creates `<REPO_ROOT>/features/<TICKET>/feature-state.json` from `pre_state` (merged over a fresh-start state)
3. Sends the prompt with this `SKILL.md` appended to the system prompt
4. Checks the state file, which sub-skills were invoked (Skill tool calls, plus the mocks' `.mock-invocations` log), and the final reply

Each mock records its invocation, leaves the state untouched (its phase stays `in_progress`), and returns. This tests the orchestration logic without running the real sub-skills. `should_suggest_next_actions` is not auto-checked; read the transcript.

Pass `--skill-dir <path>` to evaluate another revision of the skill with the same runner and mocks.

## Iteration

| Failure | Fix |
|---|---|
| Does sub-skill work itself | Strengthen "you are an orchestrator" language; add anti-pattern example |
| Skips hard gate | Tighten gate language; add explicit "ambiguous = not approved" rule |
| Advances on `failed` | Add "STOP means stop" with example |
| Re-runs completed phases | Add completed_phases check as separate TodoWrite item |
| Output restates sub-skill content | Point to the artifact instead; say what finished, where it is, and what you need from the user |
| Misorders phase invocations | Make the transition table mandatory reading; have it as part of references |
| Forgets to set hard-gate flag after approval | Add an explicit step: "Approval received → write flag = true → THEN invoke next" |

## Special consideration: orchestrator skills are hard to test

This skill's job is to invoke other skills. That makes pure-function testing impossible. The evals here use:
- **State assertions** (was the state file shaped right?)
- **Invocation assertions** (was the right sub-skill called? via mocks)
- **Output assertions** (did the bootstrap say the right thing to the user?)

Even with all three, some failures only show up in real end-to-end runs. After each eval pass, also run one real end-to-end on a fixture multi-service feature.
