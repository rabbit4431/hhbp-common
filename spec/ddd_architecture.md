# DDD Microservice General Architecture Template

> Abstracted from this project into a domain-agnostic DDD microservice blueprint applicable to any business scenario.

---

## Module Structure

```
{service-name}/
│
├── {service}-api/                          # External contracts (shared with callers)
│   └── src/main/java/com/heshuo/ddd/api/
│       ├── client/                         # OpenFeign interfaces for remote callers
│       │   └── RemoteXxxService.java
│       └── dto/
│           ├── req/                        # Inbound request DTOs (grouped by operation)
│           │   └── XxxReqDTO.java
│           └── rsp/                        # Outbound response DTOs
│               └── XxxRspDTO.java
│
├── {service}-domain/                       # Business core (pure Java, no framework deps)
│   └── src/main/java/com/heshuo/ddd/domain/
│       ├── entity/                         # Aggregate roots and their sub-entities
│       │   ├── AggregateRootA/
│       │   │   ├── AggregateRootA.java     # Aggregate root (owns lifecycle)
│       │   │   ├── AggregateRootALog.java  # Audit trail
│       │   │   └── AggregateRootARelatedXxx.java
│       │   └── AggregateRootB/
│       │       └── ...
│       ├── repository/                     # Data access interfaces (impl in infra)
│       │   └── XxxRepository.java
│       ├── service/                        # Domain services (stateless business rules)
│       │   └── XxxDomainService.java
│       ├── external/                       # Interfaces for cross-service dependencies
│       │   ├── service/                    # Abstractions (user, payment, config, etc.)
│       │   │   └── UserService.java
│       │   └── dto/                        # DTOs from external services
│       │       └── UserDTO.java
│       ├── event/                          # Domain events
│       │   ├── XxxCreatedEvent.java
│       │   ├── XxxStatusChangedEvent.java
│       │   └── XxxCompletedEvent.java
│       ├── vo/                             # Value objects and enums
│       │   ├── XxxStatusEnum.java
│       │   └── XxxTypeEnum.java
│       ├── dto/                            # Internal DTOs between domain services
│       │   └── XxxCreateDTO.java
│       └── factory/                        # Factory methods for complex object creation
│           └── XxxFactory.java
│
├── {service}-application/                  # Use-case orchestration layer
│   └── src/main/java/com/heshuo/ddd/application/
│       ├── facade/
│       │   ├── controller/                 # Thin REST controllers (validate → delegate)
│       │   │   ├── XxxController.java
│       │   │   └── BusinessXxxController.java
│       │   └── dto/                        # Facade-level request/response DTOs
│       │       ├── req/
│       │       └── rsp/
│       ├── service/                        # Application services (use-case implementations)
│       │   └── XxxAppService.java          # load → domain service → publish event → map
│       ├── consumer/                       # Async message consumers (one per topic)
│       │   └── XxxConsumer.java
│       ├── mapper/                         # MapStruct: ReqDTO → DomainDTO → Entity → RspDTO
│       │   └── XxxMapper.java
│       ├── engine/                         # Isolated business algorithms (match, score, calc)
│       │   └── XxxEngine.java
│       ├── external/                       # Feign-based impls of domain external interfaces
│       │   └── service/
│       │       └── UserServiceImpl.java
│       ├── event/                          # Event listeners and publishers
│       │   └── XxxEventListener.java
│       ├── excel/                          # Bulk import/export
│       │   ├── listener/
│       │   └── processor/
│       ├── util/                           # Response helpers, permission, 3rd-party wrappers
│       │   └── XxxUtil.java
│       └── config/                         # Application-level Spring configuration
│           └── ThreadPoolConfig.java
│
├── {service}-infrastructure/               # Technical implementations (no business logic)
│   └── src/main/java/com/heshuo/ddd/infrastructure/
│       ├── persistence/
│       │   ├── dao/
│       │   │   ├── mybatis/                # MyBatis mapper interfaces
│       │   │   │   └── XxxMapper.java
│       │   │   └── query/                  # Query object builders
│       │   │       └── XxxQuery.java
│       │   ├── po/                         # ORM-mapped persistence objects (DB rows)
│       │   │   └── XxxPO.java
│       │   ├── mapper/                     # PO ↔ Domain Entity converters
│       │   │   └── XxxPOMapper.java
│       │   └── repository/                 # Concrete repository implementations
│       │       └── XxxRepositoryImpl.java
│       ├── adapter/                        # External service interface implementations
│       │   ├── UserServiceImpl.java        # → user-service via Feign
│       │   ├── PaymentServiceImpl.java     # → payment-service via Feign
│       │   └── ConfigServiceImpl.java      # → config-service via Feign
│       ├── rabbitmq/
│       │   ├── producer/                   # Domain event publishers
│       │   │   └── XxxProducer.java
│       │   ├── payload/                    # Message payload POJOs
│       │   │   └── XxxPayload.java
│       │   └── constants/                  # Exchange, queue, and routing key constants
│       │       └── MQConstants.java
│       ├── cache/                          # Redis key definitions and TTL constants
│       │   └── RedisConstant.java
│       ├── assembler/                      # Complex object assembly from multiple entities
│       │   └── XxxAssembler.java
│       └── config/                         # Infrastructure Spring configuration beans
│           └── DataSourceConfig.java
│
└── {service}-service/                      # Spring Boot bootstrap entry point
    └── src/main/java/com/heshuo/ddd/starter/
        ├── Application.java                # @SpringBootApplication, wires all modules
        ├── controller/                     # Thin REST controllers — one per aggregate
        │   ├── XxxController.java          # validate input → delegate to XxxAppService
        │   └── YyyController.java
        ├── service/                        # Application service layer — one per aggregate
        │   ├── XxxService.java             # interface
        │   ├── YyyService.java
        │   └── impl/
        │       ├── XxxServiceImpl.java     # orchestrate: HttpClient / Feign → parse → return
        │       └── YyyServiceImpl.java
        ├── jobhandler/                     # Scheduled job entry points (XXL-Job / @Scheduled)
        │   └── XxxJobHandler.java          # thin handler — delegates to XxxService
        ├── support/                        # Shared cross-cutting helpers (no business logic)
        │   └── HttpResponseParser.java     # e.g., unwrap ApiResponse<T> from raw HTTP bodies
        ├── constant/                       # URL paths, service names, Redis keys, etc.
        │   ├── XxxConstant.java
        │   └── RedisConstant.java
        └── enums/                          # Service-level enums shared across controllers/services
            └── XxxEnum.java
```

---

## Dependency Rules

```
{service}-service
      │ depends on
{service}-application ──────────────────────────────────┐
      │ depends on                                       │
{service}-domain  ◄──── {service}-infrastructure        │
      ▲                                                  │
      └──────────── {service}-api ◄─────────────────────┘
```

**Key invariant:** `domain` has zero outbound dependencies. All other modules point inward to it.

---

## Standard Request Flow

```
HTTP Request
  → Controller              (validate input, map to app DTO)
  → AppService              (transaction boundary, orchestration)
  → DomainService           (pure business rules)
  → Repository [interface]  (domain layer)
  → RepositoryImpl          (infrastructure layer)
  → MyBatis Mapper → MySQL

Side effects:
  DomainService → External interface → Adapter → Feign → Other service
  AppService    → MQ Producer        → RabbitMQ
  AppService    ← MQ Consumer        ← RabbitMQ (async path)
```

---

## New Service Checklist

1. Identify **3–8 aggregate roots** (core concepts owning their lifecycle)
2. Define **repository interfaces** per aggregate root (`domain/repository/`)
3. Define **external service interfaces** for cross-service data needs (`domain/external/service/`)
4. Define **domain events** for significant state transitions (`domain/event/`)
5. Implement **controllers + app services** — one method per use case
6. Implement **PO + Mapper + RepositoryImpl** per aggregate (`infrastructure/persistence/`)
7. Implement **adapters** per external interface (`infrastructure/adapter/`)
8. Wire **MQ producers** for outgoing events, **consumers** for incoming async events
