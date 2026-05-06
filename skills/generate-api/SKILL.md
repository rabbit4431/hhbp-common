---
name: generate-api
description: >
  Generate Java API code (controllers, DTOs, services, repositories, POs) in Maven
  multi-module projects following DDD or Simple architecture.
  Trigger when the user asks to generate an API, create a new endpoint, add a controller
  method, scaffold a feature, or generate code for a use case — e.g.
  "add create waybill API", "generate freight bill query endpoint",
  "scaffold the full stack for X", "generate CRUD for Y".
  Detects architecture mode automatically from module folder names.
  Loads spec files (ddd_architecture.md + backend-development-standards.md) only when writing files, not during planning.
---

# Generate Java API Code

## Step 1 — Detect Architecture Mode

Scan the immediate child directories of the current working directory.

- **DDD mode**: modules matching `*-application`, `*-domain`, and `*-infrastructure` are all present
- **Simple mode**: only `*-api` and `*-service` are present; no application/domain/infrastructure modules

Print one confirmation line:

```
Detected: DDD mode  (modules: transport-api, transport-application, transport-domain, transport-infrastructure, transport-service)
```

or

```
Detected: Simple mode  (modules: freight-api, freight-service)
```

If neither pattern matches, ask the user to describe the module layout before continuing.

---

## Step 2 — Resolve Base Package and Gather API Shape

Read one `.java` source file in the primary module to determine the root package.
Store this as `BASE_PKG` (e.g. `com.heshuo.ddd`). All generated `package` declarations use it.

Then ask the user for anything not already provided:

1. **Business feature name** — used to derive all class names
   (e.g. "create waybill", "query freight bill list", "cancel order")
2. **HTTP method + path** (e.g. `POST /waybills`, `GET /freight-bills/{id}`)
3. **Request fields** — name, type, required/optional, validation rule
   - If not provided: "What fields does the request body / path / query contain?"
4. **Response fields** — name and type
   - If not provided: "What fields should the response return?"
5. **Scope** — which layers to generate?
   - Default (press Enter): full stack
   - Alternative: name specific layers, e.g. "controller + app service only"

Collect all answers before moving to the next step. Do not write any file yet.

---

## Step 3 — Inquire Business Logic

Ask the user to describe the business logic the AppService method should implement.
Present all questions at once and wait for answers before proceeding.

```
Please describe the business logic for this operation:

1. Core operation — what does this feature do in one sentence?
   e.g. "Driver accepts a freight order by binding a truck to a freight bill"

2. Aggregates to load — which domain objects need to be fetched from the database?
   e.g. "FreightBill (by freightBillId), FreightCommand (if type=2), Route (by routeId)"
   (Leave blank if this is a pure read or the operation creates a new root)

3. External service calls — which cross-service data is needed?
   e.g. "RemoteUserService: get driver penalty status, get user info list"
        "RemoteTruckService: get truck detail by truckId"
   (Leave blank if none)

4. Validation rules — what business rules must pass before the operation proceeds?
   e.g. "Driver must not be restricted; freight bill must have remaining volume > 0;
         truck must be in APPROVED state"
   (Leave blank if there are no special rules beyond null checks)

5. Side effects after the core operation — what else must happen?
   e.g. "Update FreightBill.residueVolume; publish WaybillCreateEvent;
         send WAYBILL_CREATED MQ message; save TransportLog"
   (Leave blank if none)

6. Distributed locking — does this operation need a Redis lock?
   e.g. "Lock on freightBillId (prevent oversell) + driverUserId (prevent duplicate)"
   (Leave blank if not needed)
```

Use the answers to determine the full structure of the AppService method.
**Do not skip this step for DDD mode** — the generated AppService body depends on it.
For Simple mode, only questions 1, 4, and 5 are typically relevant.

---

## Step 4 — API Format Requirements (reference — read before generating)

This step is a specification reference, not a user prompt. Apply these rules to all generated code.

### 4.1 AppService Orchestration Pattern

`XxxAppService` is the transaction boundary (`@Transactional`) and orchestration layer.
Follow this order inside the method body, driven by the answers from Step 3:

```
1. Acquire distributed lock (RedisLock.lock / RedisMultiLock) — if step 3 answer 6 is set
2. Call external services (RemoteXxxService) — validation data from step 3 answer 3
3. Load domain aggregates via repository interfaces (XxxRepository#findById) — step 3 answer 2
4. Assert business rules (Assert.isTrue / Assert.notNull) — step 3 answer 4
5. Build domain DTO and call domain service (XxxService#create / #update)
6. Trigger secondary aggregate updates — step 3 answer 5
7. Send MQ messages (XxxProducer#send) — step 3 answer 5
8. Publish Spring domain events (SpringContextHolder.publishEvent) — step 3 answer 5
9. Save operation logs (TransportLogService#create) — step 3 answer 5
10. Release lock in finally block — if step 3 answer 6 is set
```

Example skeleton:

```java
@Transactional(rollbackFor = Exception.class)
public XxxRspDTO create(XxxCreateReqDTO req) {
    try {
        RedisLock.lock(RedisConstant.XXX_KEY + req.getId(), 10);           // ① lock

        RemoteYyyRspDTO yyyInfo = remoteYyyService.getById(req.getYyyId()); // ② external
        Assert.isTrue(yyyInfo.isActive(), XxxResponseEnum.YYY_INACTIVE);   // ④ validate

        Yyy yyy = yyyRepository.findById(req.getYyyId());                   // ③ load

        XxxCreateDTO createDTO = new XxxCreateDTO();                        // ⑤ domain
        createDTO.setYyy(yyy);
        Xxx xxx = xxxService.create(createDTO);

        yyyService.xxxCreateEvent(yyy);                                      // ⑥ secondary
        xxxProducer.send(EXCHANGE, ROUTING_KEY, Payload.of(payload));        // ⑦ MQ
        SpringContextHolder.publishEvent(new XxxCreatedEvent(xxx.getId())); // ⑧ event

        return xxxDTOMapper.do2RspDto(xxx);
    } finally {
        RedisLock.unlock(RedisConstant.XXX_KEY + req.getId());              // ⑩ unlock
    }
}
```

### 4.2 External Service Call Patterns

**Application layer** (`application/external/service/`) — used by AppService:

```java
// RemoteXxxService wraps Feign clients; handles response unwrapping and null checks
@Slf4j
@Service
@RequiredArgsConstructor
public class RemoteUserService {
    private final RemoteUserCenterClient remoteUserCenterClient;

    public UserInfoRspDTO getUserById(Long userId) {
        ApiResponse<UserInfoRspDTO> resp = remoteUserCenterClient.getUserById(userId);
        Assert.isTrue(resp != null && resp.isSuccess(), GlobalResponseMessage.FAIL);
        return resp.getData();
    }
}

// In AppService — inject and call (never call Feign client directly):
private final RemoteUserService remoteUserService;
UserInfoRspDTO user = remoteUserService.getUserById(req.getUserId());
```

**Domain layer** (`domain/external/service/`) — interface only, implemented in application:

```java
// domain/external/service/UserService.java — no framework import
public interface UserService {
    UserDTO getById(Long userId);
}

// application/external/service/UserServiceImpl.java
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {
    private final RemoteUserCenterClient client;
    @Override
    public UserDTO getById(Long userId) { ... }
}
```

**Rules:**
- AppService → `RemoteXxxService` (application/external/service), **never** Feign client directly
- DomainService → `domain/external/service` interface only
- Neither layer may reference a MyBatis `Mapper` directly

### 4.3 Repository and Database Query Patterns

All DB access goes through repository interfaces. `XxxRepositoryImpl` extends
`ServiceImpl<XxxMapper, XxxPo>` and uses the injected `XxxMapper` for reads.
`XxxConvertMapper` is accessed via its static `INSTANCE`, not injected.

```java
// Save — BeanUtils.clone for simple domain→PO conversion
public void save(Xxx domain) {
    XxxPo po = BeanUtils.clone(domain, XxxPo.class);
    super.save(po);
}

// Find by ID — selectById + INSTANCE convert
public Xxx findById(Long id) {
    XxxPo po = xxxMapper.selectById(id);
    Assert.notNull(po, "record not found");
    return XxxConvertMapper.INSTANCE.po2Do(po);
}

// Update — INSTANCE convert + updateById
public void update(Xxx domain) {
    XxxPo po = XxxConvertMapper.INSTANCE.do2Po(domain);
    xxxMapper.updateById(po);
}

// Delete
public void deleteById(Long id) {
    super.removeById(id);
}

// Conditional query — LambdaQueryWrapper
public List<Xxx> findByCondition(XxxQueryParam param) {
    LambdaQueryWrapper<XxxPo> wrapper = Wrappers.lambdaQuery();
    if (param.getStatus() != null) {
        wrapper.eq(XxxPo::getStatus, param.getStatus());
    }
    List<XxxPo> poList = xxxMapper.selectList(wrapper);
    return poList.stream()
                 .map(XxxConvertMapper.INSTANCE::po2Do)
                 .collect(Collectors.toList());
}

// Batch query — selectBatchIds, never loop + selectById
public List<Xxx> findByIds(Collection<Long> ids) {
    if (CollectionUtils.isEmpty(ids)) {
        return Collections.emptyList();
    }
    List<XxxPo> poList = xxxMapper.selectBatchIds(ids);
    return poList.stream()
                 .map(XxxConvertMapper.INSTANCE::po2Do)
                 .collect(Collectors.toList());
}

// Pagination (in AppService, not RepositoryImpl)
public PageRspDTO<XxxRspDTO> page(PageReqDTO req) {
    PageUtils.startPage(req);
    List<XxxPo> poList = xxxMapper.selectList(null);
    return PageUtils.getPageRspDTO(poList, XxxRspDTO.class);
}
```

Custom SQL on `XxxMapper` (joins or multi-table conditions):

```java
@Select("SELECT * FROM xxx WHERE status = #{status} AND shipper_id = #{shipperId}")
List<XxxPo> findByStatusAndShipper(@Param("status") String status,
                                    @Param("shipperId") Long shipperId);
```

---

## Step 5 — Derive Class Names

Apply the naming convention tables below. Show the derived names to the user if any are
non-obvious (e.g. ambiguous aggregate name).

### DDD Mode

| Layer | Class pattern | Example (feature: "create waybill") |
|---|---|---|
| Request DTO (HTTP endpoint) | `XxxCreateReqDTO` | `WaybillCreateReqDTO` |
| Response DTO | `XxxRspDTO` | `WaybillRspDTO` |
| Controller | `XxxController` | `WaybillController` |
| AppService | `XxxAppService` | `WaybillAppService` |
| DTOMapper | `XxxDTOMapper` | `WaybillDTOMapper` |
| Domain entity | `Xxx` | `Waybill` |
| Domain service | `XxxService` | `WaybillService` |
| Domain internal DTO | `XxxCreateDTO` | `WaybillCreateDTO` |
| Repository interface | `XxxRepository` | `WaybillRepository` |
| PO | `XxxPo` | `WaybillPo` |
| MyBatis mapper | `XxxMapper` | `WaybillMapper` |
| PO↔Domain converter | `XxxConvertMapper` | `WaybillConvertMapper` |
| Repository impl | `XxxRepositoryImpl` | `WaybillRepositoryImpl` |

> One `XxxController` groups all endpoints for the same aggregate.
> One `XxxAppService` covers all use cases for the same aggregate — add a method, don't create a new class.
> Request DTOs for HTTP endpoints → `application/facade/dto/req/`. The `api` module is Feign-only.

### Simple Mode

| Layer | Class pattern | Example |
|---|---|---|
| Request DTO | `XxxCreateReqDTO` | `WaybillCreateReqDTO` |
| Response DTO | `XxxRspDTO` | `WaybillRspDTO` |
| Controller | `XxxController` | `WaybillController` |
| Service interface | `XxxService` | `WaybillService` |
| Service impl | `XxxServiceImpl` | `WaybillServiceImpl` |

---

## Step 6 — Check Existing Files and Show Plan Tree

For each file that would be generated, check whether it already exists on disk.

- **Does not exist** → mark `[CREATE]`
- **Exists** → mark `[ADD METHOD]` — append the new method only; never regenerate the class skeleton

Print the full plan tree before writing anything. Example:

```
Feature: create waybill  (POST /waybills)

transport-application
  [CREATE]     src/main/java/.../facade/dto/req/WaybillCreateReqDTO.java
  [CREATE]     src/main/java/.../facade/dto/rsp/WaybillRspDTO.java
  [ADD METHOD] src/main/java/.../facade/controller/WaybillController.java
                 → waybillCreate(WaybillCreateReqDTO) : ApiResponse<Waybill>
  [ADD METHOD] src/main/java/.../service/WaybillAppService.java
                 → waybillCreate(WaybillCreateReqDTO) : Waybill
  [CREATE]     src/main/java/.../mapper/WaybillDTOMapper.java

transport-domain
  [CREATE]     src/main/java/.../domain/entity/Waybill.java
  [CREATE]     src/main/java/.../domain/dto/WaybillCreateDTO.java
  [CREATE]     src/main/java/.../domain/service/WaybillService.java
  [CREATE]     src/main/java/.../domain/repository/WaybillRepository.java

transport-infrastructure
  [CREATE]     src/main/java/.../persistence/po/WaybillPo.java
  [CREATE]     src/main/java/.../persistence/dao/mybatis/WaybillMapper.java
  [CREATE]     src/main/java/.../persistence/mapper/WaybillConvertMapper.java
  [CREATE]     src/main/java/.../persistence/WaybillRepositoryImpl.java

Proceed with generation? (Yes / No / adjust scope)
```

**Do not write any file until the user explicitly confirms.**

---

## Step 7 — Load Specifications Then Generate

Only after the user confirms, check whether the spec files are already in context:

- **Specs already loaded** (either file was read or its content quoted earlier in this conversation):
  skip reading — proceed directly to generation.
- **First time in this session**: read both files now.

```
Reading: ../../spec/ddd_architecture.md
Reading: ../../spec/backend-development-standards.md
```

Apply these rules without exception in every generated file:

| Rule | Correct pattern |
|---|---|
| Empty list return | `Collections.emptyList()` — never `Lists.newArrayList()` |
| Business validation | `Assert.isTrue(condition, ResponseMessage)` — no throw statements |
| Object mapping | MapStruct — no manual setter chains for cross-type mapping |
| Distributed IDs | `IdWorker.getId()` |
| Audit fields | Never set `createTime / updateTime / createBy / updateBy` manually |
| Layer access | Application and domain layers call repository interfaces only, never `XxxMapper` |
| Service classes | `@Slf4j` + `@RequiredArgsConstructor` |
| Controller response | `ApiResponseBuilder.execute(() -> ...)` on every method |
| Pagination | `PageUtils.startPage(req)` + `PageUtils.getPageRspDTO(...)` |
| Guard clauses | Return early on edge cases; avoid deep nesting |
| Loops | No DB or external calls inside loops — use batch operations |

### Generated File Templates

#### Request DTO
```java
package {BASE_PKG}.application.facade.dto.req;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import javax.validation.constraints.NotNull;
import java.io.Serializable;

@Data
public class XxxCreateReqDTO implements Serializable {
    @ApiModelProperty(value = "field description", required = true)
    @NotNull(message = "fieldName cannot be null")
    private Long fieldName;
    // ... user-specified fields
}
```

#### Response DTO
```java
package {BASE_PKG}.application.facade.dto.rsp;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import java.io.Serializable;

@Data
public class XxxRspDTO implements Serializable {
    @ApiModelProperty("id")
    private Long id;
    // ... user-specified fields
}
```

#### Controller (new file / or added method only)
```java
// Full new file:
@Api(value = "Xxx Management", tags = "Xxx Management")
@RestController
@RequestMapping(GlobalConstants.REST_BASE_URL_PATTERN)
@RequiredArgsConstructor
public class XxxController {
    private final XxxAppService xxxAppService;

    @ApiOperation("feature description")
    @PostMapping("/xxxs")
    public ApiResponse<XxxRspDTO> create(@RequestBody @Validated XxxCreateReqDTO req) {
        return ApiResponseBuilder.execute(() -> xxxAppService.create(req));
    }
}

// ADD METHOD only — output just the new method:
@ApiOperation("feature description")
@PostMapping("/xxxs")
public ApiResponse<XxxRspDTO> create(@RequestBody @Validated XxxCreateReqDTO req) {
    return ApiResponseBuilder.execute(() -> xxxAppService.create(req));
}
```

#### AppService (method body driven by Step 2 answers)
```java
@Slf4j
@Service
@RequiredArgsConstructor
public class XxxAppService {
    private final XxxRepository xxxRepository;
    private final XxxService xxxService;
    private final XxxDTOMapper xxxDTOMapper;
    // inject RemoteXxxService, producers, etc. based on step 2

    @Transactional(rollbackFor = Exception.class)
    public XxxRspDTO create(XxxCreateReqDTO req) {
        // body generated from step 3 answers following the orchestration pattern in §4.1
    }
}
```

#### Domain Entity
```java
package {BASE_PKG}.domain.entity;

import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;

@Getter
@Setter
public class Xxx implements Serializable {
    private Long id;
    // ... user-specified fields
}
```

#### Domain Service
```java
package {BASE_PKG}.domain.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class XxxService {
    private final XxxRepository xxxRepository;

    public Xxx create(XxxCreateDTO dto) {
        Xxx xxx = new Xxx();
        xxx.setId(IdWorker.getId());
        // set fields from dto
        return xxxRepository.save(xxx);
    }
}
```

#### Repository Interface
```java
package {BASE_PKG}.domain.repository;

import java.util.Collection;
import java.util.List;

public interface XxxRepository {
    Xxx save(Xxx domain);
    void update(Xxx domain);
    void deleteById(Long id);
    Xxx findById(Long id);
    List<Xxx> findByIds(Collection<Long> ids);
}
```

#### PO
```java
package {BASE_PKG}.infrastructure.persistence.po;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;
import java.time.LocalDateTime;

@Getter
@Setter
@TableName("xxx")
public class XxxPo implements Serializable {
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    // ... user-specified fields
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    @TableField(fill = FieldFill.INSERT)
    private Long createBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updateBy;
}
```

#### MyBatis Mapper
```java
package {BASE_PKG}.infrastructure.persistence.dao.mybatis;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface XxxMapper extends BaseMapper<XxxPo> {
    // add custom query methods here if needed
}
```

#### ConvertMapper (PO ↔ Domain, static INSTANCE)
```java
package {BASE_PKG}.infrastructure.persistence.mapper;

import org.mapstruct.*;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE,
        nullValueCheckStrategy = NullValueCheckStrategy.ALWAYS)
public interface XxxConvertMapper {
    XxxConvertMapper INSTANCE = Mappers.getMapper(XxxConvertMapper.class);
    XxxPo do2Po(Xxx domain);
    Xxx po2Do(XxxPo po);
}
```

#### RepositoryImpl
```java
package {BASE_PKG}.infrastructure.persistence;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Repository;

@Repository
@Slf4j
@RequiredArgsConstructor
public class XxxRepositoryImpl extends ServiceImpl<XxxMapper, XxxPo>
        implements XxxRepository {

    private final XxxMapper xxxMapper;

    @Override
    public Xxx save(Xxx domain) {
        XxxPo po = BeanUtils.clone(domain, XxxPo.class);
        super.save(po);
        return domain;
    }

    @Override
    public Xxx findById(Long id) {
        XxxPo po = xxxMapper.selectById(id);
        Assert.notNull(po, "record not found");
        return XxxConvertMapper.INSTANCE.po2Do(po);
    }

    @Override
    public void update(Xxx domain) {
        XxxPo po = XxxConvertMapper.INSTANCE.do2Po(domain);
        xxxMapper.updateById(po);
    }

    @Override
    public void deleteById(Long id) {
        super.removeById(id);
    }

    @Override
    public List<Xxx> findByIds(Collection<Long> ids) {
        if (CollectionUtils.isEmpty(ids)) {
            return Collections.emptyList();
        }
        List<XxxPo> poList = xxxMapper.selectBatchIds(ids);
        return poList.stream()
                     .map(XxxConvertMapper.INSTANCE::po2Do)
                     .collect(Collectors.toList());
    }
}
```

#### DTOMapper (application layer)
```java
package {BASE_PKG}.application.mapper;

import org.mapstruct.*;
import org.mapstruct.factory.Mappers;
import java.util.List;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE,
        nullValueCheckStrategy = NullValueCheckStrategy.ALWAYS)
public interface XxxDTOMapper {
    XxxDTOMapper INSTANCE = Mappers.getMapper(XxxDTOMapper.class);
    Xxx reqDto2Do(XxxCreateReqDTO req);
    XxxRspDTO do2RspDto(Xxx domain);
    List<XxxRspDTO> doList2RspList(List<Xxx> list);
}
```

---

## Step 8 — Post-generation Summary

Print a concise summary after all files are written:

```
Generated for feature: create waybill (POST /waybills)

Created (N):
  transport-application/.../facade/dto/req/WaybillCreateReqDTO.java
  transport-application/.../facade/dto/rsp/WaybillRspDTO.java
  transport-application/.../facade/controller/WaybillController.java
  transport-application/.../service/WaybillAppService.java
  transport-application/.../mapper/WaybillDTOMapper.java
  transport-domain/.../entity/Waybill.java
  transport-domain/.../dto/WaybillCreateDTO.java
  transport-domain/.../service/WaybillService.java
  transport-domain/.../repository/WaybillRepository.java
  transport-infrastructure/.../persistence/po/WaybillPo.java
  transport-infrastructure/.../persistence/dao/mybatis/WaybillMapper.java
  transport-infrastructure/.../persistence/mapper/WaybillConvertMapper.java
  transport-infrastructure/.../persistence/WaybillRepositoryImpl.java

Methods added to existing files (N):
  WaybillController.java     → waybillCreate(...)
  WaybillAppService.java     → waybillCreate(...)

Reminder: add WaybillMapper to @MapperScan in the starter Application if it is a new aggregate.
```

---

## Guiding Principles

- **Never regenerate an existing class skeleton.** When a file exists, add only the new method.
- **Load spec files only once per session.** If already loaded (by this skill or `/generate-code`), skip re-reading at Step 7.
- **The plan tree must be shown and confirmed before any file is written.**
- **Domain layer stays pure.** No Spring imports in entity classes; no mapper calls in domain/application services.
- **Audit fields are never set manually.** MyBatis Plus fills them automatically on insert/update.
- **No DB or external service calls inside loops.** Use batch operations (`selectBatchIds`, multi-item Feign calls).
- **AppService body is driven by Step 3 answers** — do not generate a trivial skeleton if the user described real orchestration logic.
