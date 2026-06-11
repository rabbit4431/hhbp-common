# Training Loop

How to improve a single skill in isolation, without re-running the entire chain.

## Per-skill independence

Every skill in this collection ships its own evals because the goal is **train each skill independently**. The collection-wide chain works only if each skill works on its own.

## What "training" means here

Not gradient-descent training. It means:

1. **Trigger training** — does the skill fire when it should and stay quiet when it shouldn't? Tuned by editing the skill's `description` in SKILL.md frontmatter.
2. **Behavior training** — when the skill fires, does it produce the right output? Tuned by editing the skill's body and bundled resources.

Both are iterative: change one thing, run evals, see what got better/worse, iterate.

## The loop

### 0. Pick one skill

You can only train one at a time. Pick the one with the lowest eval score, or the one that's been giving you trouble in real usage.

### 1. Read the skill's `evals/README.md`

Each skill ships its own eval setup. The eval prompts are tailored to that skill — generic eval suites miss the specific failure modes each skill has.

### 2. Run the trigger eval

```bash
cd skills/<skill-name>
./evals/run-trigger.sh
```

This runs N prompts that should fire the skill (positive cases) and M prompts that should NOT fire it (negative cases). The output reports trigger rate per category.

Common failure modes:
- **Under-triggering** (false negatives): description is too narrow, or doesn't match real user phrasing. Fix by widening + adding "pushy" language. See `docs/triggering.md`.
- **Over-triggering** (false positives): description is too broad. Fix by adding exclusions in description ("Do NOT use for X, Y, Z").

### 3. Run the behavior eval

```bash
./evals/run-behavior.sh
```

This runs prompts that should fire the skill and checks the output against expected behaviors. Some checks are structural (was the right file created?), some are quality (does the output match the format spec?).

Common failure modes:
- **Skipped steps**: skill body uses prose where it should use a numbered checklist. The model skims and misses steps.
- **Hallucinated content**: skill body lacks an example of the right output shape. Add one to `references/example-output.md`.
- **Wrong tool used**: skill body doesn't constrain tool choice. Add explicit "use Bash for X, use Edit for Y."

### 4. Edit the skill

In order of cheapest to most expensive:

1. Edit `SKILL.md` description (affects trigger only)
2. Edit `SKILL.md` body (affects behavior; this is usually the right knob)
3. Add an example to `references/`
4. Add a helper script to `scripts/`
5. Add a new section to the body that references the new resource

### 5. Re-run the failing eval

Confirm the change improved the failing case **and didn't regress others**.

### 6. Commit and move on

Commit the skill in isolation. Don't bundle changes to multiple skills in one commit — it makes regressions hard to bisect.

## Cross-skill changes

If you find yourself wanting to change two skills together, that's a smell. Usually it means:

- A foundation skill changed in a way that breaks domain skills. Revert the foundation skill change; do it as an opt-in instead.
- Two skills are too tightly coupled. Refactor: move the shared concept into the wire protocol (`feature-state.json` fields) so neither skill knows about the other directly.

## When to add a new eval prompt

When you observe a real failure in real usage that the eval suite missed. Add the prompt that triggered the failure to the eval JSON, with the correct expected behavior. Now the eval suite is a record of every observed failure mode.

## Per-skill eval JSON schema

`evals/trigger-eval.json`:

```json
{
  "skill": "<skill-name>",
  "positive_cases": [
    {
      "prompt": "...",
      "should_trigger": true,
      "tags": ["primary", "common-phrasing"]
    }
  ],
  "negative_cases": [
    {
      "prompt": "...",
      "should_trigger": false,
      "reason_for_excluding": "..."
    }
  ]
}
```

`evals/behavior-eval.json`:

```json
{
  "skill": "<skill-name>",
  "cases": [
    {
      "prompt": "...",
      "expected_outputs": {
        "files_created": ["features/<TICKET>/contracts/x.md"],
        "state_updates": {"phase": "contracts"},
        "must_contain": ["Trigger", "Shape", "Error responses"],
        "must_not_contain": ["TODO", "FIXME"]
      }
    }
  ]
}
```

The structured `expected_outputs` lets the eval runner make objective pass/fail calls without subjective grading.
