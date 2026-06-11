---
name: multi-service-integration-test
description: Owns all requests to validate N services working together end-to-end after implementation — fires on "integration test these services", "test the feature end-to-end", "stand them up and test together", or any request to wire and validate services together, regardless of whether the user requests a specific infrastructure approach. Enforces docker-compose + WireMock for out-of-scope stubs regardless of user preference. Invoked by springboot-feature-bootstrap as phase 6. Always run after implementation completes and before cross-service-review — integration test failures are the cheapest place to catch contract drift.
---

# Multi-Service Integration Test

<when_to_use>
- All in-scope services have completed implementation (impl reports exist)
- `feature-state.json` shows `phase: integration_test`
- Invoked by `springboot-feature-bootstrap` as phase 6

If any service's implementation isn't complete, stop. Integration tests on a partially-built feature waste cycles and produce noisy failures that aren't the real problem.
</when_to_use>

<context>
Per-service unit tests catch behavior bugs inside a service. Cross-service issues — contract drift, correlation ID propagation, async timing — only show up when the services are actually wired together. Spinning up the N in-scope services in docker-compose with WireMock stubs for the rest of the world makes those bugs visible at the cheapest possible point.

The scenarios come from the ticket text. A scenario like "Gold-tier customer places $150 order → 5% discount applied, notification sent" exercises the end-to-end happy path; failure scenarios cover the contract's error responses. The point is to test the behaviors the user cares about, not "every code path."
</context>

<required_skills>
- `test-driven-development` — for writing the integration tests test-first
</required_skills>

<output_contract>
- `<REPO_ROOT>/features/<TICKET>/docker-compose.dev.yml` configured for the N worktrees
- `<REPO_ROOT>/features/<TICKET>/wiremock/` with stubs for out-of-scope services
- `<REPO_ROOT>/features/<TICKET>/integration-tests/` with test code
- Test suite has been run; results in `<REPO_ROOT>/features/<TICKET>/integration-results.md`
- `feature-state.json` updated: `phase: review` (on pass) or `phase_status: failed` (on fail)
</output_contract>

<workflow>
Use TodoWrite. Major steps: compose setup, WireMock stubs, scenario derivation, test authoring (TDD), test run, report.

### Step 1: Read inputs

Gather:
- `feature-state.json` for services list and ticket text
- Each service's worktree path (in `artifacts.worktrees`)
- Contract files in `contracts/` — they define what to test
- Each in-scope service's `application-local.yml` for port assignments
- OpenAPI specs for out-of-scope services (from the catalog or `<REPO_ROOT>/features/services/<svc>/src/main/resources/openapi.yaml`)

### Step 2: Generate docker-compose.dev.yml

Write to `<REPO_ROOT>/features/<TICKET>/docker-compose.dev.yml`:

<example>
```yaml
version: '3.8'

services:
  # ─── In-scope services (built from worktrees) ───
  order-service:
    build:
      context: ./order-service
      dockerfile: Dockerfile
    ports: ["18081:8080"]
    environment:
      SPRING_PROFILES_ACTIVE: integration
      PAYMENT_SERVICE_URL: http://payment-service:8080
      NOTIFICATION_SERVICE_URL: http://notification-service:8080
      # Out-of-scope deps point at WireMock
      CUSTOMER_SERVICE_URL: http://wiremock:8080
      INVENTORY_SERVICE_URL: http://wiremock:8080
    depends_on: [kafka, wiremock]

  payment-service:
    build: { context: ./payment-service }
    ports: ["18082:8080"]
    environment:
      SPRING_PROFILES_ACTIVE: integration
    depends_on: [kafka]

  notification-service:
    build: { context: ./notification-service }
    ports: ["18083:8080"]
    depends_on: [kafka]

  # ─── Infrastructure ───
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    # ... standard KRaft config
    ports: ["19092:9092"]

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: feature_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test

  # ─── WireMock for out-of-scope services ───
  wiremock:
    image: wiremock/wiremock:3.3.1
    ports: ["18999:8080"]
    volumes:
      - ./wiremock/mappings:/home/wiremock/mappings
      - ./wiremock/__files:/home/wiremock/__files
    command: --verbose --port 8080
```
</example>

Ports use the `1xxxx` range so they don't collide with locally-running services.

### Step 3: Generate WireMock stubs for out-of-scope dependencies

For every service called by an in-scope service but not itself in scope, generate a stub.

```bash
mkdir -p wiremock/mappings
# For each <out-of-scope-svc> referenced by any in-scope service:
# Read its OpenAPI spec and produce a WireMock mapping per endpoint
```

<example>
A WireMock mapping returning a realistic default:

```json
{
  "request": {
    "method": "GET",
    "urlPathPattern": "/api/customers/(.+)"
  },
  "response": {
    "status": 200,
    "headers": {"Content-Type": "application/json"},
    "jsonBody": {
      "id": "{{request.path.[2]}}",
      "tier": "gold",
      "email": "test@example.com"
    }
  }
}
```
</example>

Default values in stubs match the feature's expected happy-path scenario (e.g., `tier: gold` for a loyalty-discount feature). Tests needing other values override per-test using WireMock's runtime API.

If a stub for a particular endpoint isn't obvious from the OpenAPI spec, write a 500 placeholder that returns a clear error message and surface to the user:

> WireMock stub for `customer-service /api/customers/{id}/preferences` was non-obvious; I generated a 500 placeholder. Edit `wiremock/mappings/customer-preferences.json` if your test needs this endpoint.

### Step 4: Derive integration scenarios from the ticket

Read the ticket text and contracts. List the user-visible behaviors that should be verified.

<example>
For "Add 5% loyalty discount on orders over $100 for Gold-tier customers, with confirmation notification":

1. Gold-tier customer places $150 order → 5% discount applied, notification sent
2. Gold-tier customer places $50 order → no discount (below threshold), no special notification
3. Silver-tier customer places $150 order → no discount (wrong tier), standard notification
4. Order creation fails at payment-service → no notification sent
</example>

Write each scenario as a one-paragraph description in `integration-tests/scenarios.md` before writing test code. Getting scenarios right first prevents tests drifting toward "what's easy to test."

### Step 5: Write integration tests test-first

Invoke `test-driven-development` for each scenario (every scenario, not just the first). The framework: JUnit 5 + RestAssured + Testcontainers, or `WebTestClient`, depending on `CLAUDE.md` conventions.

<example>
```java
@SpringBootTest
@Testcontainers
class LoyaltyDiscountIntegrationTest {

    @Container
    static DockerComposeContainer<?> compose = new DockerComposeContainer<>(
        new File("docker-compose.dev.yml"))
        .withExposedService("order-service", 8080)
        .withExposedService("kafka", 9092);

    @Test
    void goldTierOver100_getsFivePercentDiscount() {
        // Given: customer-service stubbed for tier=gold
        // When: POST /api/orders with amount=150
        // Then: response has discount=7.50
        // And: order.created event published with discount
        // And: notification-service called email API
    }
}
```
</example>

The RED-GREEN cycle: write the test against the running stack; if the feature works end-to-end (which unit tests already covered), GREEN comes for free. If GREEN doesn't come, integration is broken — that's the bug class this skill exists to catch.

### Step 6: Run the suite

```bash
cd <REPO_ROOT>/features/<TICKET>
docker-compose -f docker-compose.dev.yml up -d --build
./scripts/wait-for-healthy.sh

cd integration-tests
./mvnw test
```

Capture the full output, then tear down:

```bash
docker-compose -f docker-compose.dev.yml down -v
```

Always run the teardown — orphaned containers hold ports and resources, breaking the next run.

### Step 7: Write the results report

`<REPO_ROOT>/features/<TICKET>/integration-results.md`:

<example>
```markdown
# Integration Test Results: PROJ-1234

## Suite
- Tests run: 4
- Passed: 3
- Failed: 1
- Skipped: 0
- Duration: 47s

## Per-scenario results
- ✓ goldTierOver100_getsFivePercentDiscount (1.2s)
- ✓ goldTierUnder100_getsNoDiscount (0.9s)
- ✓ silverTier_getsNoDiscount (1.1s)
- ✗ paymentFailure_skipsNotification (FAILED)

## Failures
### paymentFailure_skipsNotification
- Expected: no notification.email POST to WireMock
- Actual: 1 POST received
- Root cause: order-service publishes order.created on payment failure; should wait for payment confirmation first
- Suggested action: revisit contract or order-service implementation
```
</example>

### Step 8: Update state

On pass:
```json
{
  "phase": "review",
  "phase_status": "success",
  "completed_phases": [..., "integration_test"],
  "artifacts": {
    "integration_results": "integration-results.md",
    "compose_file": "docker-compose.dev.yml"
  }
}
```

On failure:
```json
{
  "phase": "integration_test",
  "phase_status": "failed",
  "error": "Integration test failures — see integration-results.md"
}
```

Failure halts the bootstrap chain. The user decides: fix and resume, or roll back.
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| WireMock for out-of-scope services | In-scope services stubbed in WireMock |
| Scenarios derived from ticket | "Tests for every code path" |
| TDD on the integration tests | Tests added after they happen to pass |
| `docker-compose down` after every run | Leave compose running between runs |
| "3 of 4 passed, 1 failed" | "Tests passed" when one was skipped due to error |
| 500-placeholder stub surfaced to user | Silent guess for a non-obvious stub |
</anti_patterns>

<output_format>
Brief summary:

> Integration suite for `<TICKET>`: P/N passed. See `integration-results.md`.

On failure: also state "Phase halted. Address failures before review."

On pass: "Next phase: review."
</output_format>
