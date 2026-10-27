# Service Discovery: PROJ-1234

## Ticket summary
Add a 5% loyalty discount on orders over $100 for Gold-tier customers, with a confirmation
notification.

Extracted:
- **Domain nouns:** order, order total ($100 threshold), loyalty discount (5%), Gold tier, customer, notification
- **Verbs/actions:** calculate discount, apply discount to order, check tier, notify (confirmation)
- **Identifiers:** `GET /loyalty/discount?customerId=&orderTotal=`, `DiscountLineItem`, `LoyaltyTier=GOLD`, MQ topic `order.completed`

## Definitely in scope
- **order-service** — owns the order lifecycle and `DiscountLineItem` (applied discounts per order).
  The $100 threshold check and the act of attaching the 5% discount to the order live here; it
  already calls loyalty via Feign for the discount amount. Evidence: root `CLAUDE.md` index routes
  "Orders" here; `order-service/CLAUDE.md` **Owns** `Order`, `OrderItem`, `DiscountLineItem` and
  **Talks to** `loyalty-service` (`GET /loyalty/discount?customerId=&orderTotal=`). Its card
  explicitly says discount *rules* are NOT owned here → they belong to loyalty-service (boundary
  confirmed).
- **loyalty-service** — owns discount calculation and the per-tier discount percentage, plus the
  `GOLD` tier value. The "5% for Gold" rule is defined and computed here. Evidence: card **Owns**
  `LoyaltyTier (BRONZE/SILVER/GOLD)` and "Discount percentage per tier"; **Entry points** list
  `LoyaltyController (GET /loyalty/discount ...)`. Root index routes "Loyalty" here.

## Likely in scope
- **notification-service** — must send the order confirmation reflecting the new discount. It already
  consumes `order.completed`, the event order-service produces, so the discounted total/line item
  must flow into the confirmation template. Evidence: `notification-service/CLAUDE.md` **MQ: consumes
  `order.completed`**; **Owns** `NotificationTemplate`. order-service card confirms it **produces
  `order.completed`** on `eval-topic-exchange`.

## Possibly in scope (needs human judgment)
- **customer-service** — notification-service Feigns to it for notification/email preferences
  (`GET /customers/{id}/notification-preferences`), and it owns `EmailPreference` (which notification
  *types* a customer receives). A "discount confirmation" may be a new notification type that needs a
  preference. Evidence: dependency hop from notification-service's **Talks to: Feign customer-service**;
  customer-service card **Owns** `EmailPreference`.
  **Question:** Is the discount confirmation a new notification type requiring an opt-in preference,
  or is it folded into the existing order-confirmation notification (no preference change)?
- **payment-service** — assessed and judged **out of scope**. It owns payment/refund only and does
  not touch discount calculation or notifications; the discounted total reaches it through the normal
  order flow with no contract change. Listed here only to record that it was considered.
  **Question:** Does charging need to occur on the post-discount total (it should already, via the
  order total order-service passes) — any change to that contract? Expected: none.

## Dependency hop
- order-service → loyalty-service (Feign), payment-service (Feign); produces `order.completed`.
- loyalty-service → consumes `order.completed`; produces `loyalty.tier_changed`.
- notification-service → customer-service (Feign); consumes `order.completed`, `loyalty.tier_changed`,
  `payment.confirmed`.
- Runtime registry (Nacos) query **not performed**: `NACOS_SERVER_ADDR` is unset and no registry is
  reachable in this fixture. Hops above are from the static **Talks to** sections only.

## Evidence
- Root index: `<REPO_ROOT>/CLAUDE.md` — service table mapping Orders→order-service,
  Loyalty→loyalty-service, Notifications→notification-service, Identity→customer-service,
  Payments→payment-service.
- Service cards read: all five `<svc>/CLAUDE.md` (Owns / Does NOT own / Entry points / Talks to).
- Live agentic search attempted but produced **no hits**:
  - `rg -n --type java '@(Get|Post|Put|Delete)Mapping' <svc>/` → none
  - `rg --type java '@RabbitListener|convertAndSend|order.completed'` → none
  - `rg --type java 'DiscountLineItem|LoyaltyTier|GOLD'` → none
  - `find . -type f -not -name CLAUDE.md` → empty
  **WARN:** This repo contains only CLAUDE.md cards; there are no Java sources to grep. Ownership and
  routing below are confirmed by the card hierarchy only — the usual live-code confirmation of exact
  endpoints/topics/field locations was not possible. Treat exact identifiers as card-asserted, not
  code-verified.

## CLAUDE.md updates recommended
- None. The card hierarchy is internally consistent and the "Does NOT own" pointers (order-service →
  loyalty for discount rules; notification → customer for preferences) cleanly resolve every boundary
  this ticket touches.

## Open questions
1. Does the Gold tier come from a live `GET /loyalty/discount` lookup at order time, or from a tier
   snapshot on the customer/order record? (Affects whether order-service reads tier directly or
   relies entirely on loyalty-service's response.)
2. Is the 5%/`$100` rule configurable in loyalty-service or hard-coded for this ticket?
3. Discount confirmation: new notification type (customer-service `EmailPreference` change) or reuse
   of the existing order-confirmation path?
