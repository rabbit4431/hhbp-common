---
name: service-discovery
description: Identify which Spring Boot services in the freight35 monorepo need to change for a given feature ticket. Use this skill whenever the user mentions a ticket, story, or requirement that may span multiple services — phrases like "which services," "what services need to change for X," "find services that handle Y," "PROJ-XXXX touches what," or when starting feature work that spans the codebase. Use proactively at the start of any multi-service feature, even if the user names only one service — they may have missed others. Also fire when the user is implementing a new feature whose requirements implicitly span multiple domains (e.g. "add an email preference" implies changes in both a settings domain and a notification domain). Read the repo-root CLAUDE.md (the service index) to locate candidates, then verify against the live code with agentic search. Do not rely on a pre-built index.
---

# Service Discovery

<when_to_use>
- User mentions a ticket or story involving multiple services
- User asks "which services handle X" or "what services do I need to change"
- User starts feature work in a domain (orders, payments, identity, notifications) without naming services
- Invoked by `springboot-feature-bootstrap` as phase 1
</when_to_use>

<context>
`freight35` is a single repo of ~54 Spring Boot services spanning freight operations, identity/IAM
(auth, user, org, permission, role, tenant), and bank channels. That's more services than anyone
holds in their head, and naming them from memory produces predictable misses: the forgotten
downstream consumer of an event you are changing, the read-side projection that materializes a
renamed field, the cron that depends on a response shape.

Two sources answer this, used in order:

1. **The CLAUDE.md hierarchy** gives durable *starting context*. The repo-root `<REPO_ROOT>/CLAUDE.md`
   indexes all services grouped by domain and routes a domain noun to candidate services; each
   `<REPO_ROOT>/<service>/CLAUDE.md` card states what that service Owns / Does NOT own / Talks to. This
   is where you find candidates fast.

2. **Live agentic search** confirms the specifics. CLAUDE.md is durable-not-volatile: trustworthy for
   *which service owns what*, but exact endpoints, topics, and field locations drift between doc
   updates. Grep the live tree to confirm ownership and catch drift. A pre-built index would freeze
   those specifics and serve them stale; the live code never lies.

Note the mixed stacks within the one repo: most services are DDD + RabbitMQ; the identity services
are single-module; the bank-channel adapters are JDK 8 / Spring Boot 2.5 / MyBatis / Flyway. Search
the layout that matches the cluster (see `references/agentic-search.md`).

The output is categorized so the human reviewer can apply judgment where neither source is decisive
(the "possibly in scope" bucket).
</context>

<repo_root>
`REPO_ROOT` is the freight35 monorepo checkout. Resolve it in this order:
1. An explicit path the user provides in their message.
2. The `$FREIGHT35_ROOT` environment variable (set this once in your shell profile).
3. `git rev-parse --show-toplevel` from the current working directory — works on
   any OS when you are already inside the repo.

If none of the above yields a path, stop and ask the user for the repo location.
All `<REPO_ROOT>/...` paths below refer to the resolved location.
</repo_root>


<output_contract>
- A rationale doc at `<REPO_ROOT>/features/<TICKET>/discovery-rationale.md` with three categorized
  buckets and an Evidence section citing both the CLAUDE.md routing and the live-search confirmation
- `feature-state.json` created or updated with `services_confirmed: false` and `phase_status: needs_human`
- The chain pauses; the user must explicitly approve scope before the next phase
</output_contract>

<workflow>
Use TodoWrite — step-skipping in discovery is the most common source of multi-service misses.

### Step 1: Read the ticket

Extract:
- Domain nouns (order, payment, customer, notification, loyalty, production-means, permission, ...)
- Verbs and actions (create, calculate, notify, validate, withdraw, authorize, ...)
- Concrete identifiers (specific endpoint paths, Kafka/Rabbit topics, entity/DTO names)

If the ticket lacks enough content for these extractions, stop and ask the user for clarification.
Guessing services from a vague ticket compounds error.

### Step 2: Seed candidates from the CLAUDE.md hierarchy

Two levels — top index, then service cards:

1. **Repo root** (`<REPO_ROOT>/CLAUDE.md`): the service index, grouped by domain (Core freight /
   Identity / Channels / Money / BFF / Adapters / Infra). Route each domain noun from Step 1 to a
   shortlist of candidate services.
2. **Service card** (`<REPO_ROOT>/<service>/CLAUDE.md`): read the shortlisted cards' **Owns**,
   **Does NOT own**, and **Talks to** sections. "Does NOT own" is gold — it points you to the
   service that *does* own a boundary you would otherwise mis-assign.

If a candidate service has no CLAUDE.md card, use the pure-search path for it (see `<missing_context>`).

### Step 3: Verify live with agentic search (primary)

For every concrete identifier from Step 1 — not just the first — confirm against the live code. The
card routes you; grep proves it.

Patterns (full set in `references/agentic-search.md`):

```bash
rg -l --type java '@(Get|Post|Put|Delete|Patch)Mapping\("[^"]*<path>' <REPO_ROOT>/<svc>/
rg -l --type java '@MQConsumer|@KafkaListener' <REPO_ROOT>/<svc>/        # who consumes the event
rg -l --type java 'class <EntityOrDtoName>' <REPO_ROOT>/
```

This step catches drift — e.g. a config class the card says lives in service A but the code shows in
service B. Treat any card-vs-code mismatch as a finding, not noise.

### Step 4: Walk one dependency hop

For every candidate so far:
- **Static:** the card's **Talks to** (Feign `Remote*Client` / `Remote*Service`) list.
- **Runtime:** query the live registry for wiring the code does not show statically:

```bash
# Nacos: registered services + instances — runtime dependency edges that
# @FeignClient annotations alone do not reveal.
curl -s "http://${NACOS_SERVER_ADDR}:8848/nacos/v1/ns/catalog/services?pageNo=1&pageSize=200"
```

Add hop results to the **candidate** list (not "confirmed") — they need human judgment.

### Step 5: Categorize into three buckets

1. **Definitely in scope** — services that directly own the changed behavior (card + grep agree)
2. **Likely in scope** — services that consume a changed contract
3. **Possibly in scope** — adjacent services from the dependency hop; flag each with a specific
   question for the human

### Step 6: Write the rationale doc

`<REPO_ROOT>/features/<TICKET>/discovery-rationale.md` — three buckets, each service line citing **both**
its CLAUDE.md routing and the live-grep confirmation.

<example>
```markdown
# Service Discovery: PROJ-1234

## Ticket summary
Add 5% loyalty discount on orders over $100 for Gold-tier customers, with confirmation notification.

## Definitely in scope
- **order-service** — owns `POST /api/orders`; the discount applies in the order creation flow.
  Evidence: `<REPO_ROOT>/CLAUDE.md` index routes "orders" here; `order-service/CLAUDE.md` Owns the
  endpoint; `rg '@PostMapping\("/api/orders' <REPO_ROOT>/order-service/` confirms it lives there.
- **loyalty-service** — owns customer tier lookup. Evidence: card Owns `GET /api/customers/{id}/tier`;
  grep confirms the controller.

## Likely in scope
- **notification-service** — consumes `order.created`; the new discount field must reach the email
  template. Evidence: its card lists `consumes order.created`; `rg '@MQConsumer' <REPO_ROOT>/notification-service/`
  confirms the consumer.

## Possibly in scope (needs human judgment)
- **analytics-service** — consumes `order.created` for revenue reporting (dependency hop + Nacos).
  Question: should analytics distinguish discounted revenue?

## Evidence
[CLAUDE.md citations above + the exact rg/curl commands run and their hits]

## CLAUDE.md updates recommended
- (only if discovery found a boundary the cards do not capture)

## Open questions
- Does the loyalty tier come from the customer record at order time, or a live lookup?
```
</example>

If discovery surfaced a boundary or trap the relevant **service card does not capture** (e.g. a
partial migration), add the "CLAUDE.md updates recommended" note — discovery is how the hierarchy
stays accurate.

### Step 7: Update feature-state.json

```json
{
  "ticket": "<TICKET>",
  "ticket_text": "<full ticket text>",
  "phase": "discovery",
  "phase_status": "needs_human",
  "services": ["<definitely-in-scope-list>"],
  "candidate_services": ["<likely-in-scope-list>", "<possibly-in-scope-list>"],
  "services_confirmed": false,
  "completed_phases": [],
  "artifacts": { "discovery_rationale": "discovery-rationale.md" }
}
```

### Step 8: Present and pause

Show the user the rationale doc. Ask explicitly:

> I've identified N services across three buckets. Review `discovery-rationale.md` and confirm or
> adjust. Reply "confirmed" once you're satisfied.

Do not advance the phase. The user confirms; you don't. On confirmation, update:

```json
{ "services_confirmed": true, "phase_status": "success", "completed_phases": ["discovery"] }
```
</workflow>

<missing_context>
If a candidate service has no CLAUDE.md card, discovery still works — fall back to **pure agentic
search** (Steps 3-4 without the Step 2 card read) for that service, and:
- note in the rationale: "WARN: <service> has no CLAUDE.md card — confirmed by live search only"
- recommend creating the card (per the hierarchy design) so the next discovery is faster.

This is the only fallback the skill needs — there is no catalog to be down.
</missing_context>

<hard_gate>
This skill does not advance the chain past discovery. `feature-workspace-setup` reads
`services_confirmed` from `feature-state.json` and refuses to run until it's `true`. Skipping the
human approval step causes downstream skills to reject — preserving the gate matters because every
downstream step costs subagent calls and worktree setup.
</hard_gate>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| "order-service owns it — its card says so, `rg` confirms the endpoint" | "order-service (because it's about orders)" |
| Verify the card's routing against live code | Trust the card for exact endpoints/fields |
| Three-bucket categorization with reasons | Flat list of service names |
| Dependency hop for every candidate (Talks-to + Nacos) | Hop one candidate, generalized to others |
| Note when a service card was missing and pure grep was used | Silently produce a result whose source is unclear |
| Flag a card that contradicts the code for update | Let stale CLAUDE.md routing stand |
| Wait for explicit "confirmed" from the user | "I'll proceed unless you say otherwise" |
</anti_patterns>

<reading_the_hierarchy>
The CLAUDE.md hierarchy is the durable map; live search is the current truth. `freight35` is one
repo, so the hierarchy is two levels:

| Level | File | What it gives discovery |
|---|---|---|
| Repo root | `<REPO_ROOT>/CLAUDE.md` | Service index grouped by domain; routes a domain noun to candidate services; stack invariants |
| Service | `<REPO_ROOT>/<service>/CLAUDE.md` | Owns / Does NOT own / Entry points / Talks to (Feign + MQ) |

Use the hierarchy for **routing and ownership** (durable). Use **grep** for exact endpoints, topics,
and field locations (volatile — they drift). Use a **live Nacos query** for runtime dependency edges
that static `@FeignClient` annotations miss.

Reference: `references/agentic-search.md` (search patterns), `references/claude-md-hierarchy.md`
(how the two levels map to discovery + the Nacos query). Spec: `references/claude-md-hierarchy-design.md`.
</reading_the_hierarchy>

<output_format>
On draft:

> Discovery rationale drafted: `features/<TICKET>/discovery-rationale.md`. N services across three
> buckets, each cited to CLAUDE.md + live search. Awaiting confirmation.

On approval:

> Services confirmed for `<TICKET>`. State advanced. Next phase: workspace setup.
</output_format>
