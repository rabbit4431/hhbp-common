---
name: generate-code
description: >
  Generate Java code for a specific class or module in a DDD Spring project.
  Use when the user wants to write or complete a single class, layer component, or focused
  piece of logic — e.g. "write the XxxRepositoryImpl", "implement the domain service for Waybill",
  "add a method to WaybillAppService", "generate the ConvertMapper for FreightBill", "write the PO
  for Order". Do NOT trigger for full endpoint chain generation — that is generate-api.
---

# Generate Java Code (Focused)

## Step 1 — Check Whether Specs Are Already Loaded

Look back through the current conversation for any prior message that references or quotes
content from `ddd_architecture.md` or `backend-development-standards.md`.

- **Specs already in context**: skip to Step 3 immediately. Do not re-read the files.
- **First time in this session**: proceed to Step 2.

---

## Step 2 — Load Specifications (First Request Only)

Read both specification files:

```
spec/ddd_architecture.md
spec/backend-development-standards.md
```

Internalize the DDD module structure, layer dependency rules, and coding standards.
Confirm with one line: `Specs loaded. Ready to generate.`

---

## Step 3 — User Describes Requirements

The user describes the business logic and requirements in their own words. This description
should include:

- What class or method to generate (e.g. `cancelWaybill` in `WaybillAppService`)
- The business context and expected behavior
- Key inputs, outputs, and any domain rules, validations, or side effects

Claude reads the description and proceeds directly to generation.
Only ask a follow-up question if a specific detail is **truly ambiguous and cannot be inferred**
from the description or the codebase. Never ask questions that the user has already answered.

---

## Step 4 — Resolve Base Package

If `BASE_PKG` is not already known from earlier in the conversation, read one `.java` file in
the relevant module to determine it. All generated `package` declarations use `BASE_PKG`.

---

## Step 5 — Check Whether the Target File Exists

- **Does not exist** → generate the complete class.
- **Exists** → output only the new method or field being added.

State the outcome before generating:

```
[CREATE]     src/main/java/.../persistence/WaybillRepositoryImpl.java
[ADD METHOD] src/main/java/.../service/WaybillAppService.java → cancelWaybill(...)
```

---

## Step 6 — Generate the Code

Apply every rule without exception.

### Coding Rules

| Rule | Required pattern |
|---|---|
| Empty list return | `Collections.emptyList()` |
| Business validation | `Assert.isTrue(condition, ResponseEnum)` |
| Object mapping | MapStruct — no manual setter chains |
| Distributed IDs | `IdWorker.getId()` |
| Audit fields | Never set manually — MyBatis Plus fills on insert/update |
| Layer isolation | Application and domain never reference `XxxMapper` directly |
| Service classes | `@Slf4j` + `@RequiredArgsConstructor` |
| Controller methods | Wrapped in `ApiResponseBuilder.execute(() -> ...)` |
| Pagination | `PageUtils.startPage(req)` + `PageUtils.getPageRspDTO(...)` |
| Batch DB reads | `selectBatchIds(ids)` — never loop + `selectById` |
| Domain entities | No Spring annotations; no framework imports |
| ConvertMapper | Static `INSTANCE = Mappers.getMapper(...)` — never `@Autowired` |
| RepositoryImpl | Extends `ServiceImpl<XxxMapper, XxxPo>` + `implements XxxRepository` |

### AppService Method Body Order (omit steps that don't apply)

```
1. Acquire distributed lock (RedisLock.lock)
2. Call external services (RemoteXxxService)
3. Load domain aggregates via repository interface
4. Assert business rules
5. Call domain service
6. Trigger secondary side effects
7. Send MQ message (XxxProducer)
8. Publish Spring domain event (SpringContextHolder.publishEvent)
9. Save operation log
10. Release lock in finally block
```

### PO — Required Audit Fields

```java
@TableField(fill = FieldFill.INSERT)        private LocalDateTime createTime;
@TableField(fill = FieldFill.INSERT_UPDATE) private LocalDateTime updateTime;
@TableField(fill = FieldFill.INSERT)        private Long createBy;
@TableField(fill = FieldFill.INSERT_UPDATE) private Long updateBy;
```

---

## Guiding Principles

- Specs are loaded **once per session**. If loaded earlier in this conversation, do not re-read.
- Never regenerate an existing class skeleton. When a file exists, output the new method only.
- Domain layer stays pure: no Spring annotations in entities; no Mapper references in domain services.
- Generate only what was asked. For full endpoint chains, use `/generate-api`.
