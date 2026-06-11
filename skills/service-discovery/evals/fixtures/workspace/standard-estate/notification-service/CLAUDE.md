# notification-service

Email, SMS, and push notification delivery.

## Owns
- NotificationTemplate, DeliveryChannel (enum: EMAIL/SMS/PUSH)
- UserNotificationPreference (per-channel opt-in/out)

## Does NOT own
- User profile → customer-service
- Loyalty events → loyalty-service

## Entry points
- NotificationController; NotificationDispatchService

## Talks to
- Feign: customer-service (GET /customers/{id}/notification-preferences)
- MQ: consumes `loyalty.tier_changed`, `order.completed`, `payment.confirmed`
