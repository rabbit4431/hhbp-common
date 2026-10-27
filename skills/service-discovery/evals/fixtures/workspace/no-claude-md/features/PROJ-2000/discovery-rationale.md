# Service Discovery: PROJ-2000

## Ticket summary
Add a new endpoint to query order history by customer tier.

> **Note:** This estate has **no CLAUDE.md hierarchy** (no repo-root index, no service cards).
> All findings below were produced by **pure agentic search** of the live code. Recommend
> creating CLAUDE.md cards (per the hierarchy design) so the next discovery is faster.

## Ticket extraction
- **Nouns:** order, order history, customer, customer tier
- **Verbs:** query, add endpoint
- **Identifiers:** none given in the ticket; derived from code below

## Definitely in scope
- **order-service** — owns order data and the `/api/orders` API; this is where the new query
  endpoint belongs.
  Evidence:
  - `rg '@RequestMapping' order-service/` → `OrderController` mounts `/api/orders` (POST create, `GET /{id}`).
  - `Order.java` entity persists `customerTier` (field at `Order.java:16`).
  - `OrderRepository.java:11` **already declares `List<Order> findByCustomerTier(String customerTier)`** —
    the data-access method for this ticket exists, but **no controller endpoint exposes it**. The work
    is primarily adding a `GET` mapping (e.g. `/api/orders?tier=` or `/api/orders/history`) that calls it.

## Likely in scope
- _(none)_ — no service consumes a contract that this read-only endpoint changes. The new endpoint
  emits no event and alters no existing payload.

## Possibly in scope (needs human judgment)
- **loyalty-service** — owns loyalty concerns keyed by customer (`GET /loyalty/discount`,
  `POST /loyalty/points`). It does **not** currently own customer-tier storage; the tier is
  denormalized onto each `Order` (`Order.customerTier`), and `OrderRepository.findByCustomerTier`
  reads it directly with no loyalty lookup.
  Evidence: `LoyaltyController.java` exposes discount/points only; no tier endpoint; order-service has
  no Feign/RestTemplate/WebClient call into it (`rg '@FeignClient|RestTemplate|WebClient'` → no hits).
  **Question:** Is "customer tier" meant to be the loyalty-service source of truth (requiring a live
  lookup or tier-validation call), or is the tier stored on the order at creation time authoritative
  for history queries? If the order's stored tier is authoritative, loyalty-service is **out of scope**.

## Out of scope (checked, excluded)
- **notification-service** — consumes the `order.created` Kafka topic
  (`OrderCreatedListener.java:15 @KafkaListener(topics = "order.created")`) and sends notifications.
  A read-only history query publishes no event and changes no event contract (`OrderCreatedEvent`
  fields unchanged), so this service needs no change.

## Dependency hop
- **Static:** No Feign `Remote*Client`, `RestTemplate`, or `WebClient` found in any service
  (`rg '@FeignClient|Remote.*Client|RestTemplate|WebClient' .` → no hits). Services are decoupled;
  the only cross-service edge is the `order.created` Kafka topic (order → notification), which this
  ticket does not touch.
- **Runtime (Nacos):** Not queryable in this fixture (no live registry / `NACOS_SERVER_ADDR`).
  No runtime edge could be confirmed beyond the static picture above.

## Evidence (commands run)
- `find . -name '*.java'` — enumerated all sources across the 3 services.
- `rg '@(Get|Post|Put|Delete|Patch|Request)Mapping' .` — endpoint inventory.
- `rg -i 'tier' .` — tier references → all in order-service (`DiscountService`, `OrderRequest`,
  `OrderRepository`, `Order`).
- `rg -i 'history|orderhistory' .` — no existing "history" naming; endpoint is genuinely new.
- `rg '@FeignClient|Remote.*Client|RestTemplate|WebClient' .` — no inter-service HTTP clients.
- `rg -i 'publish|rabbit|kafka|amqp|@MQ' order-service/` — order-service publishes no events.

## CLAUDE.md updates recommended
- Estate has no CLAUDE.md cards at all. Recommend adding a repo-root service index and per-service
  cards. For order-service, the card's **Owns** should note `findByCustomerTier` already exists in
  the repository layer — a non-obvious head start for tier-query work.

## Open questions
1. Authoritative tier source: order's stored `customerTier` vs. live loyalty-service lookup (gates
   whether loyalty-service is in scope).
2. Endpoint shape: query param (`GET /api/orders?tier=gold`) vs. sub-path (`GET /api/orders/history?tier=`)?
3. Pagination / date-range for "history", or full result set?
