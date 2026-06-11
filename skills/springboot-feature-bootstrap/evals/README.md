# Evals: springboot-feature-bootstrap

This is the orchestrator skill. Its evals are heavier than other skills because each behavior case may simulate multiple phases.

## Files

- `trigger-eval.json` — does the skill fire on multi-service feature requests?
- `behavior-eval.json` — does the orchestration work? (state init, phase ordering, hard-gate enforcement, failure stop, resume)
- `run-trigger.sh` — runs trigger eval
- `run-behavior.sh` — runs behavior eval against fixture sub-skills

## Running

```bash
./run-trigger.sh
./run-behavior.sh
```

## Behavior eval fixtures

Most behavior cases use a `pre_state` to simulate the bootstrap arriving mid-chain. The runner:

1. Creates `<REPO_ROOT>/features/<TICKET>/feature-state.json` with `pre_state`
2. Sends the prompt
3. Reads the state file afterward
4. Verifies the bootstrap invoked the right sub-skill (via mock) and updated state correctly

Sub-skill mocks live in `fixtures/mock-skills/`. Each mock skill writes a predictable `phase_status` and exits. This lets us test the orchestration logic without actually running all 8 sub-skills.

## Iteration

| Failure | Fix |
|---|---|
| Does sub-skill work itself | Strengthen "you are an orchestrator" language; add anti-pattern example |
| Skips hard gate | Tighten gate language; add explicit "ambiguous = not approved" rule |
| Advances on `failed` | Add "STOP means stop" with example |
| Re-runs completed phases | Add completed_phases check as separate TodoWrite item |
| Output too verbose | Add the "be terse" example and contrast with bad version |
| Misorders phase invocations | Make the transition table mandatory reading; have it as part of references |
| Forgets to set hard-gate flag after approval | Add an explicit step: "Approval received → write flag = true → THEN invoke next" |

## Special consideration: orchestrator skills are hard to test

This skill's job is to invoke other skills. That makes pure-function testing impossible. The evals here use:
- **State assertions** (was the state file shaped right?)
- **Invocation assertions** (was the right sub-skill called? via mocks)
- **Output assertions** (did the bootstrap say the right thing to the user?)

Even with all three, some failures only show up in real end-to-end runs. After each eval pass, also run one real end-to-end on a fixture multi-service feature.
