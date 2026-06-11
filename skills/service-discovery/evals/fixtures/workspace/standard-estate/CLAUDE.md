# eval-estate — service index

Minimal eval fixture simulating a Spring Boot monorepo. Stack: Spring Boot 3.2.x, RabbitMQ, Nacos.

## Services

| Service | Domain | Responsibility |
|---|---|---|
| order-service | Orders | Order lifecycle: create, update, cancel |
| loyalty-service | Loyalty | Gold-tier rewards and discount calculation |
| notification-service | Notifications | Email, SMS, push notification delivery |
| payment-service | Payments | Payment processing and reconciliation |
| customer-service | Identity | Customer profile, preferences, settings |

## DDD module layout

Each service: `<svc>-api / -domain / -application / -infrastructure / -service`
Controllers: `*-application/**/facade/controller`
Entities: `*-domain/**/entity`

## Stack invariants

- Messaging: RabbitMQ (NOT Kafka) — exchange `eval-topic-exchange`
- Registry: Nacos
- All services run on :8080
