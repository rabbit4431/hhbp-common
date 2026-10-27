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
│       ├── service/                        # Domain services (business rules + aggregate save)
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

> **Write path:** lifecycle writes (create / state-transition / update / delete) go
> `AppService → aggregate instruction (self-persist) | AggregateDomainService.save → Repository`.
> See **Aggregate Persistence & Lifecycle Pattern** below.

---

## Aggregate Persistence & Lifecycle Pattern

> How an aggregate and its value objects are persisted, and how lifecycle changes are applied. The
> aggregate root **owns its lifecycle**; the application layer orchestrates use cases but never drives
> persistence procedurally. (Domain code depends only on the shared `com.hswl.core` utilities —
> `SpringContextHolder`, `Assert`, `UserContext` — not on `application`/`infrastructure`.)

### Aggregate root owns its value objects

A root carries its child **value objects** in memory and persists/replaces them **as a unit**. The
application layer never inserts/updates child rows directly.

```java
public class Aggregate {                              // domain/entity/
    private Integer version;                           // optimistic-lock column
    private List<AggregateChild> children = new ArrayList<>();   // value objects, owned by the root
    // ...
}
```

### Saving — a domain service saves root + value objects, respectively

A **create** use case calls a domain service that saves the root, then each value-object collection in
turn. Domain services are `@Service`, fetch repositories via `SpringContextHolder`, and carry **no**
`@Transactional` (the transaction is the app service's).

```java
@Service
public class AggregateDomainService {
    public void save(Aggregate aggregate) {
        SpringContextHolder.getBean(AggregateRepository.class).save(aggregate);          // assigns id
        List<AggregateChild> children = aggregate.getChildren();
        if (CollUtil.isNotEmpty(children)) {
            children.forEach(c -> c.setAggregateId(aggregate.getId()));                  // back-fill FK
            SpringContextHolder.getBean(AggregateChildRepository.class).saveBatch(children);
        }
    }
}
```

### Lifecycle ops — instructions on the aggregate (self-persisting)

State transitions, `update`, and `delete` are **methods on the aggregate root**, each shaped
`assert precondition → mutate → persist`. The aggregate obtains its repositories via `SpringContextHolder`;
the application service just calls the instruction.

```java
public class Aggregate {

    /** state transition: assert → mutate → optimistic persist + append audit log */
    public void approve(Integer expectedVersion, Long operatorId) {
        assertCanApprove();                                                  // pure guard
        AggregateStatus from = this.status;
        this.status = AggregateStatus.ACTIVE;
        boolean ok = SpringContextHolder.getBean(AggregateRepository.class)
                .updateStatus(this, expectedVersion, operatorId);           // version-guarded
        Assert.isTrue(ok, "stale data — please refresh and retry");
        SpringContextHolder.getBean(AggregateLogRepository.class)
                .append(AggregateLog.of(id, from, this.status, operatorId)); // append-only
    }

    /** full edit: optimistic update of root + replace value objects through the root */
    public void update(Integer expectedVersion, Long operatorId) {
        assertEditable();
        this.updateBy = operatorId;
        Assert.isTrue(SpringContextHolder.getBean(AggregateRepository.class)
                .updateEditable(this, expectedVersion), "stale data — please refresh and retry");
        AggregateChildRepository childRepo = SpringContextHolder.getBean(AggregateChildRepository.class);
        childRepo.deleteByAggregateId(id);
        if (CollUtil.isNotEmpty(children)) {
            children.forEach(c -> c.setAggregateId(id));
            childRepo.saveBatch(children);
        }
    }

    public void assertCanApprove() {                                         // pure, unit-testable
        Assert.isTrue(status == AggregateStatus.PENDING, "only PENDING may be approved");
    }
}
```

**Rules:**

- **Optimistic locking** — every status/edit write is guarded by a `version` column; a stale version
  matches no row and is rejected (`Assert.isTrue(ok, ...)`).
- **Audit log** — status changes append an **immutable** log row inside the transition; reasons /
  opinions are append-only and never updated or overwritten.
- Keep precondition checks and field validation as **pure** methods (`assertCanApprove()`,
  `validateForXxx()`) so they remain unit-testable without persistence.

### Application service stays thin

Write use cases: **load aggregate → call the aggregate instruction (or `AggregateDomainService.save`)
→ return view model.** The `@Transactional(rollbackFor = Exception.class)` boundary sits on the
**app-service** method — not the domain service or the aggregate.

```java
@Service
@RequiredArgsConstructor
public class AggregateAppService {
    private final AggregateDomainService aggregateDomainService;
    private final AggregateRepository aggregateRepository;

    @Transactional(rollbackFor = Exception.class)
    public AggregateRspDTO create(AggregateSaveReqDTO req) {
        Aggregate aggregate = AggregateConvertMapper.INSTANCE.toEntity(req);   // incl. value-object lists
        aggregateDomainService.save(aggregate);
        return detail(aggregate.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public AggregateRspDTO approve(Long id, Integer version) {
        Aggregate aggregate = loadExisting(id);
        aggregate.approve(version, UserContext.getUserId());                   // instruction on the aggregate
        return detail(id);
    }
}
```

### Cross-cutting (reuse existing standards)

- **DTO ↔ domain** — MapStruct populates the aggregate (including its value-object lists) before
  save/update; map enum↔code and derived fields via mapper default methods / `expression`.
  → `backend-development-standards.md` §1.3 *Object Property Mapping*.
- **domain ↔ PO** — `XxxRepositoryImpl` converts between domain entities and persistence objects with
  `com.hswl.core.utils.BeanUtils.copyProperties(src, target)` (Spring — copies matching properties,
  silently skipping any whose target type isn't assignable from the source) for the bulk, then maps
  type-divergent fields **explicitly** — e.g. an enum ↔ its stored code `String`
  (`po.setStatus(c.getStatus().getCode())` / `entity.setStatus(StatusEnum.get(po.getStatus()))`).
  Do **not** use `BeanUtils.clone(po, Entity.class)` for enum-as-code entities: it is a FastJSON
  round-trip that serializes enums by **name** (`DRAFT`), corrupting stored codes (`draft`) and
  breaking `WHERE status='draft'`; `clone` is only safe when no field's type diverges from its column.
  → `backend-development-standards.md` §8.7 *Bean Utilities (BeanUtils)*.
- **Bean access in domain** — entities and domain services obtain beans with
  `SpringContextHolder.getBean(...)` (keeps the entity a plain POJO). Operator id from
  `UserContext.getUserId()` (§12); `createBy` / `updateBy` / `createTime` / `updateTime` are auto-filled
  by `MybatisPlusMetaObjectHandler` (§9.3); guards via `Assert` (§7.2); ids via the distributed-id util (§8.1).

### Testing self-persisting domain

Unit-test aggregates / domain services by stubbing `SpringContextHolder` with a mock `ApplicationContext`
and registering mock repositories; assert state changes and verify persistence calls. Reset between tests.

```java
ApplicationContext ctx = Mockito.mock(ApplicationContext.class);
new SpringContextHolder().setApplicationContext(ctx);                       // install
Mockito.lenient().when(ctx.getBean(AggregateRepository.class)).thenReturn(repoMock);
// ... exercise aggregate.approve(...) / domainService.save(...), then assert + verify ...
SpringContextHolder.clearHolder();                                         // teardown (@AfterEach)
```

Pure validation / precondition guards (`assertCanApprove()`, `validateForXxx()`) need no context and
are tested directly.

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
