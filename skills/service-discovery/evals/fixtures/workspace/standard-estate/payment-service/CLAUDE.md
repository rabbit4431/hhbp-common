# payment-service

Payment processing and reconciliation.

## Owns
- Payment, PaymentStatus (enum: PENDING/CONFIRMED/FAILED/REFUNDED)
- RefundRequest

## Does NOT own
- Order totals → order-service

## Entry points
- PaymentController; PaymentService

## Talks to
- Feign: order-service (validates order before charging)
- MQ: produces `payment.confirmed`, `payment.failed`
