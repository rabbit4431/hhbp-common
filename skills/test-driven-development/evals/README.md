# Evals: test-driven-development

How to evaluate and improve this skill in isolation.

## Files

- `trigger-eval.json` — does the skill fire on the right prompts?
- `behavior-eval.json` — when it fires, does it produce the right output?
- `run-trigger.sh` — runs trigger eval, reports trigger rate per case
- `run-behavior.sh` — runs behavior eval, reports pass/fail per assertion

## Running

### Trigger eval

```bash
./run-trigger.sh
```

Output:
```
SKILL: test-driven-development
POSITIVE CASES (7):
  ✓ controller-endpoint            [triggered]
  ✓ dto-field-addition             [triggered]
  ✓ kafka-listener                 [triggered]
  ✓ repository-method              [triggered]
  ✓ service-business-logic         [triggered]
  ✓ dto-validation                 [triggered]
  ✗ contract-driven-endpoint       [NOT triggered] ← problem
NEGATIVE CASES (6):
  ✓ private-method-rename          [correctly did not trigger]
  ✓ config-port-change             [correctly did not trigger]
  ✓ javadoc-typo                   [correctly did not trigger]
  ✓ logger-statement               [correctly did not trigger]
  ✓ read-only-inspection           [correctly did not trigger]
  ✓ opt-out-attempt                [triggered as expected — should refuse]

Trigger rate (positives): 6/7 = 86%
False positive rate:      0/6 = 0%
```

### Behavior eval

```bash
./run-behavior.sh
```

Each case is run in a clean test workspace. The runner:
1. Starts Claude Code with the skill loaded
2. Sends the prompt
3. Inspects the workspace afterward for the expected outputs
4. Reports pass/fail per assertion

## Iteration

When trigger rate is below 90% on positives:
- Read the failing case and find what's distinctive about its phrasing
- Edit the `description` field in SKILL.md to include phrasing closer to the failing case
- Re-run

When false positive rate is above 5%:
- Read the falsely-triggered case
- Add an exclusion clause to the description ("Do NOT use for X, Y")
- Re-run

When behavior eval fails:
- The skill's body needs improvement, not the description
- Identify which step the skill is skipping or doing wrong
- Add stronger language, examples, or anti-patterns to the SKILL.md body
- Re-run

## When to add new eval cases

Add a case whenever you observe a real failure in real usage. The eval suite is a record of every observed failure mode — it gets better with use.
