---
name: contract-first-design
description: Produce inter-service contracts (OpenAPI deltas, AsyncAPI / Kafka event schemas) for a multi-service feature BEFORE any implementation begins. Use whenever the user says "draft the contracts", "design the API shape", "design the inter-service interactions", "what's the contract for X", or invoked by springboot-feature-bootstrap as phase 3. Use a structured fill-in-the-template approach — one template per inter-service boundary. Requires explicit human approval (sets contracts_approved hard gate) before downstream phases run.
---

# Contract-First Design

<when_to_use>
- `feature-state.json` shows `phase: contracts` and worktrees set up
- The user asks to design contracts for a multi-service feature
- Invoked by `springboot-feature-bootstrap` as phase 3
</when_to_use>

<context>
Inter-service contracts are the only thing that lets services be developed in parallel without coordinating constantly. They're also the single largest source of integration bugs when they're vague or undocumented.

This skill replaces multi-turn brainstorming with a structured template that forces explicit answers to the questions integration bugs come from: error responses, idempotency, ordering, observability. Anything that's genuinely undecided goes in the "Open question" section so the human reviewer sees it, rather than getting a plausible-sounding guess.
</context>

<output_contract>
- `<REPO_ROOT>/features/<TICKET>/contracts/` directory with one file per inter-service boundary
- `feature-state.json` updated: `contracts_approved: false`, `phase_status: needs_human`
- The chain pauses at a hard gate; the user must explicitly approve
</output_contract>

<boundary_definition>
One boundary = one direction of communication between two services.

- `order-service` calls `payment-service` POST `/charge` — one boundary
- `order-service` publishes `order.created`, `notification-service` consumes it — one boundary
- `order-service` calls `payment-service` for two unrelated reasons — likely two boundaries

The rule of thumb: if changing one shape doesn't affect the other, they're separate boundaries.
</boundary_definition>

<contract_template>
For each boundary, write a file at `contracts/<producer>-to-<consumer>.md` using exactly this template:

<example>
````markdown
# Contract: order-service → payment-service

## Interaction type
REST

## Trigger
When a customer submits an order, the order service charges the order amount to the customer's payment method.

## Shape
```yaml
paths:
  /api/orders/{id}/charge:
    post:
      summary: Charge for an order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [amount, currency, idempotencyKey]
              properties:
                amount: {type: number}
                currency: {type: string}
                idempotencyKey: {type: string}
      responses:
        '200':
          description: Charge succeeded
          content:
            application/json:
              schema:
                type: object
                properties:
                  chargeId: {type: string}
                  status: {type: string, enum: [succeeded]}
        '402':
          description: Payment declined
        '409':
          description: Idempotency conflict
```

## Error responses
Every error case with the exact status code and what the consumer does:

- `402 Payment Declined`: consumer marks the order as `payment_failed`, does not retry
- `409 Idempotency Conflict`: consumer treats as success, fetches existing charge
- `5xx`: consumer retries with exponential backoff, max 3 attempts

## Idempotency
Consumer provides `idempotencyKey` header on every request. Producer dedupes for 24 hours.

## Ordering
N/A (REST request/response — no ordering concerns).

## Observability
- Correlation ID: header `X-Correlation-ID` propagated by consumer; producer logs it on every entry
- Metric: `payment.charge.duration` histogram, `payment.charge.outcome` counter labeled by status
- Logs: producer logs request/response shape minus card details; consumer logs response status and chargeId

## Open question for human review
- Should declined payments be retried with a different payment method, or is one attempt the contract?
- Is 24-hour idempotency window enough, or should it be 7 days?
````
</example>
</contract_template>

<workflow>
Use TodoWrite. One todo per boundary plus a meta-todo for the approval gate.

### Step 1: Read inputs

- `feature-state.json` for ticket text and services
- The full ticket text (not just the summary)
- Existing OpenAPI specs at `<worktree>/src/main/resources/openapi.yaml` for each service
- `CLAUDE.md` for project conventions

### Step 2: Identify every boundary

From the ticket and service relationships, list every inter-service interaction the feature requires. For each:
- Producer (who initiates)
- Consumer (who responds or processes)
- Direction (request/response vs event)

If a boundary is uncertain, list it as a candidate and flag it in the open-questions section of one of the certain contracts. Don't invent boundaries to be safe.

### Step 3: Fill in each contract completely

For every boundary (not just the first), fill in the template:

- Shape is the full schema, not partial. No `# more fields here`.
- Errors enumerate every status code or error event shape, with consumer behavior for each.
- Idempotency is stated even when it's "this is one-shot, no idempotency needed."
- Genuinely undecided points go in "Open question for human review" — they don't get arbitrary defaults.

Base decisions on existing project conventions where they exist:
- Existing OpenAPI specs in the producer service for naming and shape patterns
- Existing Kafka topic naming conventions
- `CLAUDE.md` for project-wide rules (correlation IDs, error envelope shapes)

### Step 4: Save the contract files

`<REPO_ROOT>/features/<TICKET>/contracts/<producer>-to-<consumer>.md` for each.

### Step 5: Set up the hard gate

```json
{
  "phase": "contracts",
  "phase_status": "needs_human",
  "contracts_approved": false,
  "artifacts": {
    "contracts_dir": "contracts/",
    "contracts_files": [
      "contracts/order-to-payment.md",
      "contracts/order-to-notification.md"
    ]
  }
}
```

### Step 6: Present and pause

> Contracts drafted for `<TICKET>`. N boundaries:
>
> - `contracts/order-to-payment.md` — REST, charge endpoint
> - `contracts/order-to-notification.md` — Kafka, order.created event
>
> Each contract has an "Open question for human review" section. Please:
>
> 1. Read each file.
> 2. Edit directly if you want changes — they're plain markdown.
> 3. Reply "approved" when you're satisfied with the scope.
>
> I will not proceed until you approve.

### Step 7: On approval

Approval is explicit: "approved", "yes", "go ahead". Treat hedged language ("maybe", "I think so") as a request for more discussion, not as approval.

When the user clearly approves:

```json
{
  "contracts_approved": true,
  "phase_status": "success",
  "completed_phases": [..., "contracts"]
}
```

If invoked by the bootstrap, control returns to it.
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Template-driven contract production | Multi-turn Socratic dialogue |
| Full schema with every field | `# additional fields` |
| Surface uncertain boundaries as open questions | Add them preemptively to be safe |
| Surface choices to the user (auth, retry policy) | Pick arbitrary defaults |
| Treat explicit "approved" as approval | Treat 👍 or "looks good?" as approval |
| Error response per status code | Glossed errors |
| Correlation ID specified | Observability section omitted |
</anti_patterns>

<output_format>
On draft:

> Drafted N contracts at `features/<TICKET>/contracts/`. Open questions: K. Awaiting approval.

On approval:

> Contracts approved for `<TICKET>`. State advanced to `planning`.

Don't repeat contract contents in chat — point at the files.
</output_format>
