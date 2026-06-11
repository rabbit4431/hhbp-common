# loyalty-service

Gold-tier customer reward tracking and discount calculation.

## Owns
- LoyaltyTier (enum: BRONZE/SILVER/GOLD)
- Discount percentage per tier
- RewardPoint accumulation rules

## Does NOT own
- Order totals → order-service
- Notification delivery → notification-service

## Entry points
- LoyaltyController (GET /loyalty/discount, POST /loyalty/points); LoyaltyService

## Talks to
- MQ: consumes `order.completed` (awards points per fulfilled order)
- MQ: produces `loyalty.tier_changed` when a customer's tier upgrades
