# order-service

Order lifecycle management: create, update, cancel, fulfillment.

## Owns
- Order, OrderItem, OrderStatus (enum: PENDING/CONFIRMED/FULFILLED/CANCELLED)
- DiscountLineItem — applied discounts per order

## Does NOT own
- Discount rules → loyalty-service

## Entry points
- OrderController; OrderService

## Talks to
- Feign: loyalty-service (GET /loyalty/discount?customerId=&orderTotal=), payment-service
- MQ: produces `order.completed` on `eval-topic-exchange`
