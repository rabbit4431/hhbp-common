# Service Discovery: PROJ-3000

## Ticket summary
Add a discount to orders. (User hint: should touch order-service and loyalty-service.)

Domain nouns: discount, order, loyalty/tier. Verb: apply/add discount.

## Definitely in scope
- **order-service** — owns the order lifecycle and the place a discount is applied to an order.
  Evidence: root `CLAUDE.md` index routes "Orders" here; `order-service/CLAUDE.md` **Owns**
  `DiscountLineItem — applied discounts per order`, and **Talks to** loyalty-service via
  Feign `GET /loyalty/discount?customerId=&orderTotal=`. Live grep confirms "discount" appears in
  this service's tree (`rg -i discount` → `order-service/CLAUDE.md`); no other code surface here in
  the fixture (card-only estate).
- **loyalty-service** — owns the discount rule itself (percentage per tier) and the endpoint
  order-service calls. Evidence: `order-service/CLAUDE.md` **Does NOT own** discount rules →
  loyalty-service; `loyalty-service/CLAUDE.md` **Owns** `Discount percentage per tier` and exposes
  `GET /loyalty/discount`. Live grep confirms "discount" appears in this service's tree.

## Likely in scope
- (none) — no other service consumes a contract that this minimal change is forced to alter. The
  core flow is order-service calling loyalty-service's existing `GET /loyalty/discount`. Adjacent
  consumers are listed below as possibly-in-scope, pending the human's read of whether the
  `order.completed` event shape and the charged amount change.

## Possibly in scope (needs human judgment)
- **notification-service** — consumes `order.completed` (per its card: `consumes ... order.completed`).
  If applying a discount changes the order total carried on `order.completed`, any order-confirmation
  message would reflect a discounted amount.
  Question: does this ticket require the confirmation/notification to show the discount, or is the
  discount purely internal to the order total? The ticket does not mention notifications.
- **payment-service** — `payment-service/CLAUDE.md` **Talks to** order-service (validates order
  before charging). A discount changes the amount to be charged.
  Question: does payment read the post-discount order total at charge time (so it bills the discounted
  amount), or does it already pull a single authoritative total from order-service that needs no change?

## Evidence
- Root index: `<REPO_ROOT>/CLAUDE.md` — routes Orders→order-service, Loyalty→loyalty-service.
- Cards read: order-service, loyalty-service, notification-service, payment-service, customer-service.
- Ownership boundary confirmed by cards: order-service **Does NOT own** discount rules → loyalty-service;
  loyalty-service **Does NOT own** order totals → order-service. The two split exactly along
  "calculate the discount" (loyalty) vs "apply it to the order" (order).
- Live search: `rg -i 'discount'` across the estate hits only `order-service/CLAUDE.md` and
  `loyalty-service/CLAUDE.md` (plus this docs tree) — no discount surface in payment, notification, or
  customer. `order.completed` consumers (loyalty-service, notification-service) and the
  order→payment Feign edge are read from the cards.
- WARN: this is a **card-only fixture** — no `.java` sources exist, so endpoints/topics could not be
  grep-confirmed in code. Ownership is confirmed by the CLAUDE.md hierarchy and the discount-term
  grep only. In a real estate, re-run the Step 3 endpoint/consumer greps against live Java.

## CLAUDE.md updates recommended
- (none) — the cards' Owns / Does NOT own / Talks to sections cleanly cover this change; no boundary
  or trap surfaced that the hierarchy fails to capture.

## Open questions
- Where does the discount input come from — Gold-tier lookup at order time via the existing
  `GET /loyalty/discount?customerId=&orderTotal=`, or a different trigger? (The fixture's
  loyalty card supports the tier-based path.)
- Should the discounted total propagate to `order.completed` consumers (notification-service) and to
  the payment charge (payment-service)? — drives whether the two possibly-in-scope services move up.
