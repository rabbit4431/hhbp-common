# customer-service

Customer profile, preferences, and notification settings.

## Owns
- Customer, CustomerTier
- NotificationPreference (per-channel opt-in/out per customer)
- EmailPreference (which notification types to receive)

## Does NOT own
- Loyalty tiers → loyalty-service
- Notification delivery → notification-service

## Entry points
- CustomerController; CustomerPreferenceService

## Talks to
- (no outbound Feign or MQ dependencies)
