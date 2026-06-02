# test-driven-development

Foundation skill. Enforces RED-GREEN-REFACTOR for Java/Maven code with a focus on boundary code (controllers, listeners, DTOs, repositories).

## What it does

Forces five steps in strict order:
1. Write failing test first
2. Run it; verify it fails for the right reason
3. Write minimum code to pass
4. Run it; verify it passes
5. Commit

Pre-test code is **deleted**, not retrofitted with tests.

## When it fires

- Direct request: "write this test-first," "use TDD"
- Domain-specific request involving boundary code: "add a POST endpoint," "add a field to OrderDTO," "create a Kafka listener"
- Invoked by other skills in this collection: `parallel-implementation`, `multi-service-integration-test`

## When it does NOT fire

- Pure refactors with no behavior change
- Internal-only helper methods (no test boundary touched)
- Configuration/property changes

Note: when the user explicitly opts out ("just write the code, no tests right now"), the skill **still fires** — it explains why it can't comply and offers to do the TDD cycle instead. It does not silently write untested code.

## Bundled resources

- `references/spring-test-patterns.md` — patterns for `@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`, `@EmbeddedKafka`
- `scripts/verify-test-fails.sh` — runs a test and confirms it fails (used in Step 2 verification)

## Training this skill

### Trigger eval

```bash
./evals/run-trigger.sh
```

Positive cases include: "add a POST /api/orders endpoint," "add a discount field to OrderDTO," "create a KafkaListener for order.created."

Negative cases include: "refactor this private method," "update the application.yml port," "fix this typo in a comment."

If the trigger rate on positives is < 90% or false-positive rate is > 5%, edit the description in SKILL.md and re-run.

### Behavior eval

```bash
./evals/run-behavior.sh
```

Checks that for a sample positive case:
- A test file was created/modified BEFORE the implementation file (by file mtimes)
- The test was run before the implementation existed (Step 2 output present)
- A commit was made with both files
- The commit message starts with `test+feat:` or `test:` or similar test-first prefix

### Common failure modes and fixes

| Failure | Fix |
|---|---|
| Skill skips Step 2 (verifying test fails) | Add stronger language: "Step 2 is non-negotiable. If you skip it, the test is meaningless." |
| Skill writes test after implementation | Description not pushy enough on "even when user doesn't mention testing." Add an example to body. |
| Skill writes vacuous assertions (`assertNotNull`) | Add an explicit anti-pattern section with a counter-example. |
| Skill batches multiple behaviors per test | Add "one behavior per test" to the cycle steps. |

## Version

v1 (2026-05-14)
