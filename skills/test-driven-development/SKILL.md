---
name: test-driven-development
description: Enforce RED-GREEN-REFACTOR test-driven development for Java/Maven code. Use this skill whenever the user asks for new code, new endpoints, new fields on DTOs, new Kafka listeners, new repository methods, or any change to boundary code (controllers, listeners, DTOs, repository interfaces). Use proactively even when the user doesn't mention testing — if the change is on a contract boundary, this skill applies. Do not skip TDD because the change feels small. Code written before its test should be deleted and re-implemented test-first.
---

# Test-Driven Development (Java / Maven)

<when_to_use>
Apply to boundary code changes:
- New REST endpoint (`@GetMapping`, `@PostMapping`, etc.)
- New Kafka listener (`@KafkaListener`)
- New field on a DTO that crosses a service boundary
- New repository method
- Any change to controller, listener, or DTO classes

Internal-only changes (private helpers, behavior-preserving refactors) are out of scope for this skill — apply it to changes that touch a test boundary.
</when_to_use>

<context>

Tests written after implementation tend to conform to what the code does, not what it should do — they pass for the wrong reasons. Writing the test first, watching it fail, then making it pass is the only reliable way to know the test actually checks the behavior. The cycle below operationalizes that.
</context>

<output_contract>
After applying this skill to a change:
- A test file exists for the new behavior
- The test file's last-modified time is before the implementation file's
- A single commit contains both files
- The commit message begins with a test-first prefix (`test+feat:`, `test:`, `feat: ... with test`)
</output_contract>

<workflow>
Use TodoWrite to track each step. Mental tracking causes step-skipping.

### Step 1: Write the failing test first

Write the test that describes the new behavior. It must compile but fail when run, because the implementation does not yet exist.

<example>
```java
// src/test/java/com/example/order/OrderControllerTest.java
@Test
void postOrder_returnsCreatedOrderWithDiscount() {
    OrderRequest request = new OrderRequest(150.00, "gold");
    mockMvc.perform(post("/api/orders")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.discount").value(7.50));
}
```
</example>

### Step 2: Run the test and confirm it fails for the right reason

```bash
./mvnw test -Dtest=OrderControllerTest#postOrder_returnsCreatedOrderWithDiscount
```

Expected failure modes confirm the test catches the missing behavior:
- `404 Not Found` (endpoint not registered)
- `400 Bad Request` (validation not configured)
- Compilation failure (class or method doesn't exist)

If the test passes here, the test isn't checking what you think it's checking. Rewrite it before continuing.

### Step 3: Write the minimum implementation to pass

Smallest change that turns the bar green. No extra fields, no extra methods, no "while I'm here" refactors.

### Step 4: Run the test and confirm it passes

```bash
./mvnw test -Dtest=OrderControllerTest#postOrder_returnsCreatedOrderWithDiscount
```

If it doesn't pass, fix the implementation. The test is the spec; don't soften the test.

### Step 5: Commit

```bash
git add src/test/java/... src/main/java/...
git commit -m "test+feat: order discount for gold tier"
```

One commit per RED-GREEN cycle. Batching multiple behaviors into one commit hides what passed when.
</workflow>

<deletion_rule>
If you find implementation code without a corresponding test, delete the implementation and start at Step 1. Retroactive test coverage produces tests that conform to existing behavior rather than verifying intended behavior.

This rule applies even when:
- The implementation looks correct
- The user is asking you to add tests for existing code
- Deleting feels like wasted work

The one exception is an explicit "backfill coverage for existing untested code" task — that's a different workflow.
</deletion_rule>

<spring_boot_specifics>
Choose the cheapest test type that proves the behavior:

| Goal | Annotation |
|---|---|
| Request/response shape | `@WebMvcTest(YourController.class)` |
| Repository query | `@DataJpaTest` |
| Message consumption | `@SpringBootTest` + `@EmbeddedKafka` |
| Pure business logic | Plain JUnit, no Spring |
| Full wired flow | `@SpringBootTest` (slow — use sparingly) |

Full examples per test type live in `references/spring-test-patterns.md`.
</spring_boot_specifics>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Test first, implementation second | Implementation first, test after |
| One behavior per test method | Several behaviors per test method |
| Concrete field assertions | `assertNotNull` or `assertTrue(true)` |
| Real Step 2 failure output | Skipping Step 2 because "obviously it'll fail" |
| Mock collaborators only | Mock the class you're testing |
</anti_patterns>

<output_format>
When a TDD cycle is complete, output:

1. The test file path and method name
2. Step 2 output (the failure)
3. The Step 3 implementation diff
4. Step 4 output (the pass)
5. The commit hash

This lets the caller verify the cycle actually happened. Anything shorter and the caller can't audit.
</output_format>
