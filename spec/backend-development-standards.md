# Backend Development Standards

| Version | Author   | Date       | Changes                                                                                                        |
| ------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| V1.0.0  | Sun Chao | 2026-03-18 | Initial release — code standards, security standards, and complete development guide                           |
| V1.1.0  | Sun Chao | 2026-03-28 | Added standards for MyBatis Plus, XXL-Job, IM, UserContext, and ApiResponseBuilder; expanded utilities section |

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Centralized Version Management](#2-centralized-version-management)
3. [Logging Standards](#3-logging-standards)
4. [Redis Usage Standards](#4-redis-usage-standards)
5. [RabbitMQ Usage Standards](#5-rabbitmq-usage-standards)
6. [HTTP Client Usage Standards](#6-http-client-usage-standards)
7. [Business Exception Handling](#7-business-exception-handling)
8. [Utility Class Standards](#8-utility-class-standards)
9. [MyBatis Plus Standards](#9-mybatis-plus-standards)
10. [XXL-Job Scheduled Task Standards](#10-xxl-job-scheduled-task-standards)
11. [IM Instant Messaging Standards](#11-im-instant-messaging-standards)
12. [UserContext Usage Standards](#12-usercontext-usage-standards)
13. [ApiResponseBuilder Standards](#13-apiresponsebuilder-standards)

---

## 1. Code Standards

### 1. Returning Empty Collections

Use JDK's `Collections.emptyList()` when returning an empty list. Do not use Guava's `Lists.newArrayList()` or `new ArrayList()`.

```java
// ✅ Recommended
return Collections.emptyList();

// ❌ Forbidden
return Lists.newArrayList();  // Guava
return new ArrayList<>();     // Pointless empty object creation
```

### 2. Exception Handling

Use the `Assert` utility from `hs-common-core` to handle business exceptions. Do not throw `BusinessException`, `RuntimeException`, etc. directly.

```java
import com.hswl.core.response.Assert;

// ✅ Recommended
Assert.isTrue(condition, GlobalResponseMessage.FAIL);

// ❌ Forbidden
throw new BusinessException("...");
throw new RuntimeException("...");
```

### 3. Object Property Mapping

Use `MapStruct` for property mapping between objects. Avoid writing large numbers of manual `set` calls.

```java
import cn.hutool.core.bean.BeanUtil;

// ❌ Forbidden
return BeanUtil.copyToList(byCondition,FreightCommandRspDTO.class);
```



### 4. Layer Access Constraints

The `application` and `domain` layers must not call `mapper` directly for database operations. All data access must go through `repository` interfaces.

### 5. Deprecation Marking

APIs or methods that are no longer in use must be annotated with `@Deprecated`. Do not delete them outright.

```java
@Deprecated
public void oldMethod() {
    // Kept for compatibility — do not add new calls
}
```

### 6. Shortest-Path Conditionals (Guard Clauses)

Handle edge cases and invalid inputs first and return early. Avoid deep nesting.

```java
// ❌ Not recommended — too deeply nested
public void statisticsBalance(List<DigitalAccountDetail> list) {
    if (CollectionUtils.isNotEmpty(list)) {
        // business logic...
    }
}

// ✅ Recommended — guard clause with early return
public void statisticsBalance(List<DigitalAccountDetail> list) {
    if (CollectionUtils.isEmpty(list)) {
        return;
    }
    // business logic...
}
```

### 7. No Database or External Calls Inside Loops

Never query the database or call external APIs inside `for`/`while` loops. Use batch operations instead.

```java
// ❌ Forbidden
for (Long id : idList) {
    UserDTO user = userMapper.selectById(id);  // N+1 problem
}

// ✅ Recommended — batch query
List<UserDTO> users = userMapper.selectBatchIds(idList);
```

---

## 2. Centralized Version Management

All dependency versions are managed by `hs-common-dependencies`. As a rule, individual sub-projects must not introduce their own version declarations. If a new version is genuinely required, declare it in `hs-common-dependencies` first.

**Parent POM version declaration:**

```xml
<properties>
    <hs-commons.version>4.0.2</hs-commons.version>
</properties>
```

**dependencyManagement import:**

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.hswl</groupId>
            <artifactId>hs-common-dependencies</artifactId>
            <version>${hs-commons.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

---

## 3. Logging Standards

Add the logging dependency as the first entry in `pom.xml`'s `<dependencies>` section:

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-log</artifactId>
    <version>4.0.2</version>
</dependency>
```

---

## 4. Redis Usage Standards

### 1. Add Dependency

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-redis</artifactId>
    <version>4.0.2</version>
</dependency>
```

### 2. RedisUtils — Basic Read/Write

```java
// Write with a 1-minute TTL
RedisUtils.set("abc", 123, 1L, TimeUnit.MINUTES);

// Read
TestRedisBean bean = RedisUtils.get("key");
```

### 3. RedisLock — Single-Key Distributed Lock

```java
RedisLock.lock(lockName, 5);  // Acquire lock, 5-second timeout
try {
    // critical section
} finally {
    RedisLock.unlock(lockName);
}
```

### 4. RedisMultiLock — Multi-Key Distributed Lock

```java
List<String> keys = new ArrayList<>();
keys.add("abc");
keys.add("edf");
RedisMultiLock.multiLock(keys, 1);
try {
    // critical section
} finally {
    RedisMultiLock.unlockMultiLock(keys);
}
```

---

## 5. RabbitMQ Usage Standards

### 1. Add Dependency

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-rabbitmq</artifactId>
    <version>4.0.2-SNAPSHOT</version>
</dependency>
```

### 2. Configure bootstrap.yml

```yaml
mq:
  connect:
    pool:
      rabbitmq-test: # Use the microservice name per MQ naming conventions
        uri: amqp://114.116.232.200:5673
        username: admin
        password: eX*MzF78Ea01JIO3
        vHost: my_vhost
        confirmType: SYNC
```

### 3. Update the Application Entry Point

Two changes are required in the startup class:

- Add `"com.hswl.rabbitmq.persistence.dao"` to `@MapperScan`
- Add `"com.hswl.rabbitmq"` to the `scanBasePackages` of `@SpringBootApplication`

```java
@Slf4j
@EnableCaching
@EnableAsync
@MapperScan({"com.heshuo.ddd.infrastructure.persistence.dao.mybatis",
             "com.hswl.rabbitmq.persistence.dao"})
@EntityScan(basePackages = {"com.heshuo.ddd.infrastructure.persistence"})
@EnableFeignClients(basePackages = {"com.heshuo"})
@SpringBootApplication(scanBasePackages = {"com.heshuo", "com.hswl.rabbitmq"})
public class MicroserviceApplication {
    public static void main(String[] args) {
        ApplicationContext ctx =
            SpringApplication.run(MicroserviceApplication.class, args);
        log.info("Microservice Application is started!");
    }
}
```

### 4. Define a Producer

```java
// factory matches the pool name in bootstrap.yml
@MQProducer(factory = "rabbitmq-test")
public class AwsRabbitmqProducer extends BaseMQProducer {
}
```

### 5. Send a Message

```java
@Autowired
private AwsRabbitmqProducer producer;

String exchange   = "aws-topic-exchange";
String routingKey = "truck.created";

AwsRabbitMqPayload payload = new AwsRabbitMqPayload();
payload.setName("aws");

producer.send(exchange, routingKey, MqPayload.make(payload));
```

### 6. Define a Consumer

```java
@MQConsumer(factory = "rabbitmq-test", queues = {"aws-normal-queue-truck"})
@CommonsLog
public class AwsRabbitmqConsumer implements MessageConsumer<AwsRabbitMqPayload> {

    public boolean onMessage(MqPayload<AwsRabbitMqPayload> payload) {
        log.info(JacksonUtils.getJsonString(payload));
        return true;
    }
}
```

---

## 6. HTTP Client Usage Standards

### 1. Add Dependency

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-client</artifactId>
    <version>4.0.2</version>
</dependency>
```

### 2. Configure Service Endpoints

```yaml
rest:
  services:
    freight-service: # Name of the target service
      domain: http://localhost:8080 # Service base URL
      log: true # Whether to persist request logs to the database
      ignores: # URIs excluded from logging when log=true
        - /api/user
```

### 3. Usage Examples

```java
// GET request
MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
params.add("a", "b");
ResponseEntity<String> resp =
    HttpClient.doGet("freight-service", "/api/orders", params);

// POST request
ObjectNode body = new ObjectMapper().createObjectNode();
body.put("name", "Zhang San");
ResponseEntity<String> resp =
    HttpClient.doPost("freight-service", "/api/users", body);

// PUT request
HttpClient.doPut("freight-service", "/api/users/1111", params);

// DELETE request
HttpClient.doDelete("freight-service", "/api/users/1111", params);
```

> **Note:** Importing `hs-common-client` will automatically create a `rest_log` table in the current database. When `rest.services.{name}.log=true`, all request logs are written to that table.

---

## 7. Business Exception Handling

### 1. Define a Business Error Enum

Implement the `ResponseMessage` interface and manage all business error codes and messages as an enum:

```java
package com.hswl.core.response;

import com.fasterxml.jackson.annotation.JsonFormat;

@JsonFormat(shape = JsonFormat.Shape.OBJECT)
public enum GlobalResponseMessage implements ResponseMessage {

    SUCCESS("0", "success") {
        @Override
        public ApiResponse<Object> of(Object data) {
            return new ApiResponse<>(data, SUCCESS);
        }
    },

    FAIL("1", "fail") {
        @Override
        public ApiResponse<Object> of(Object data) {
            return new ApiResponse<>(data, FAIL);
        }
    };

    private final String code;
    private final String message;

    GlobalResponseMessage(String code, String message) {
        this.code    = code;
        this.message = message;
    }

    @Override public String getCode()    { return this.code;    }
    @Override public String getMessage() { return this.message; }
}
```

### 2. Use Assert for Validation

```java
import com.hswl.core.response.Assert;

public class OrderService {
    public void createOrder(OrderRequest req) {
        Assert.isTrue(req != null,   GlobalResponseMessage.FAIL);
        Assert.isTrue(req.isValid(), GlobalResponseMessage.FAIL);
    }
}
```

---

## 8. Utility Class Standards

### 1. Distributed ID Generation

```java
import com.baomidou.mybatisplus.core.toolkit.IdWorker;

Long id = IdWorker.getId();
```

### 2. Object Utilities

```java
import java.util.Objects;

Objects.nonNull(obj);  // check non-null
Objects.isNull(obj);   // check null
```

### 3. String Utilities

```java
import org.apache.commons.lang3.StringUtils;

StringUtils.isEmpty("123");  // check empty string
StringUtils.isBlank("  ");   // check blank string
```

### 4. Collection Utilities

```java
import org.apache.commons.collections4.CollectionUtils;

CollectionUtils.isEmpty(list);     // check empty collection
CollectionUtils.isNotEmpty(list);  // check non-empty collection
```

### 5. Map Utilities

```java
import org.apache.commons.collections4.MapUtils;

MapUtils.isEmpty(map);     // check empty map
MapUtils.isNotEmpty(map);  // check non-empty map
```

### 6. JSON Serialization (JacksonUtils)

```java
import com.hswl.core.utils.JacksonUtils;

// Object to JSON string
String json = JacksonUtils.getJsonString(obj);

// JSON string to object
UserDTO user = JacksonUtils.jsonStr2Bean(json, UserDTO.class);

// JSON string to list
List<UserDTO> list = JacksonUtils.jsonStr2List(json, UserDTO.class);

// JSON string to map
Map<String, Object> map = JacksonUtils.jsonStr2Map(json);
```

> `JacksonUtils` has built-in `LocalDateTime` / `LocalDate` serialization support — no additional configuration required.

### 7. Bean Utilities (BeanUtils)

```java
import com.hswl.core.utils.BeanUtils;

// Deep clone (same type)
UserDTO copy = BeanUtils.clone(source);

// Deep clone (cross-type, via JSON round-trip)
UserVO vo = BeanUtils.clone(userDTO, UserVO.class);

// Shallow property copy (matching field names)
BeanUtils.copyProperties(source, target);
```

### 8. Collection Set Operations (CollectionOptUtils)

```java
import com.hswl.core.utils.CollectionOptUtils;

// Union (a ∪ b)
List<Long> union = CollectionOptUtils.union(listA, listB, User::getId);

// Intersection (a ∩ b)
List<Long> intersection = CollectionOptUtils.intersection(listA, listB, User::getId);

// Difference (a - b)
List<Long> subtract = CollectionOptUtils.subtract(listA, listB, User::getId);

// Symmetric difference (elements in exactly one of the two sets)
List<Long> disjunction = CollectionOptUtils.disjunction(listA, listB, User::getId);
```

### 9. Geographic Distance Utility (DistanceUtil)

```java
import com.hswl.core.utils.DistanceUtil;

// Calculate distance between two coordinates (in km, 3 decimal places)
double km = DistanceUtil.getDistance(
    116.397128, 39.916527,   // origin (longitude, latitude)
    121.473701, 31.230416    // destination (longitude, latitude)
);
```

---

## 9. MyBatis Plus Standards

### 1. Add Dependency

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-mybatis-plus</artifactId>
    <version>4.0.2</version>
</dependency>
```

### 2. Paginated Queries

The frontend passes a `PageReqDTO`; the backend uses `PageUtils` to execute pagination and return a `PageRspDTO`:

```java
// Controller layer
@PostMapping("/list")
public ApiResponse<PageRspDTO<OrderVO>> list(@RequestBody PageReqDTO req) {
    return ApiResponseBuilder.execute(() -> orderService.list(req));
}

// Service layer
public PageRspDTO<OrderVO> list(PageReqDTO req) {
    PageUtils.startPage(req);
    List<OrderPO> pos = orderMapper.selectList(null);
    return PageUtils.getPageRspDTO(pos, OrderVO.class);
}
```

**Common PageReqDTO fields:**

| Field       | Type    | Default | Description                                         |
| ----------- | ------- | ------- | --------------------------------------------------- |
| `pageNum`   | Integer | 1       | Current page number (minimum 1)                     |
| `pageSize`  | Integer | 10      | Page size (maximum 1500)                            |
| `deepPage`  | Boolean | false   | Enable cursor-based pagination (for large datasets) |
| `cursor`    | Long    | —       | Cursor ID (used when `deepPage=true`)               |
| `condition` | Map     | —       | Extended multi-condition query parameters           |

> When `deepPage=true`, the pagination skips the `COUNT(*)` query, making it suitable for tens-of-millions-of-rows scenarios.

### 3. Automatic Audit Field Population

`MybatisPlusMetaObjectHandler` automatically populates the following fields on insert/update — no manual assignment needed:

| Field        | Type          | Trigger                                          |
| ------------ | ------------- | ------------------------------------------------ |
| `createTime` | LocalDateTime | INSERT                                           |
| `updateTime` | LocalDateTime | INSERT / UPDATE                                  |
| `createBy`   | Long          | INSERT (from `UserContext.getUserId()`)          |
| `updateBy`   | Long          | INSERT / UPDATE (from `UserContext.getUserId()`) |

Entity classes must declare the fill strategy with `@TableField`:

```java
@TableField(fill = FieldFill.INSERT)
private LocalDateTime createTime;

@TableField(fill = FieldFill.INSERT_UPDATE)
private LocalDateTime updateTime;

@TableField(fill = FieldFill.INSERT)
private Long createBy;

@TableField(fill = FieldFill.INSERT_UPDATE)
private Long updateBy;
```

### 4. SQL Injection Protection

The framework includes a built-in `SqlFilterArgumentResolver` that automatically intercepts `Page` parameters whose sort fields contain the following keywords, preventing SQL injection:

`master` / `truncate` / `insert` / `select` / `delete` / `update` / `declare` / `alter` / `drop` / `sleep` / `extractvalue` / `concat`

No additional configuration is needed — it takes effect automatically once the dependency is imported.

---

## 10. XXL-Job Scheduled Task Standards

### 1. Add Dependency

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-job</artifactId>
    <version>4.0.2</version>
</dependency>
```

### 2. Configure application.yml

```yaml
xxl:
  job:
    enabled: true # Set to true only for services that require scheduling
    admin:
      addresses: http://xxl-job-admin:8080/xxl-job-admin
    executor:
      appname: my-service-executor # Executor name registered in the XXL-Job console
      ip: # Leave blank to auto-detect the local IP
      port: 9999 # Executor port
      logpath: /data/applogs/xxl-job
      logretentiondays: 30
    accessToken: your-access-token
```

> **Note:** For services that do not need scheduled tasks, set `xxl.job.enabled=false` or omit the configuration entirely to avoid registering unnecessary executors.

### 3. Define a Job Handler

```java
import com.xxl.job.core.handler.annotation.XxlJob;
import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.biz.model.ReturnT;

@Component
public class OrderJobHandler {

    @XxlJob("orderTimeoutCheckHandler")
    public ReturnT<String> orderTimeoutCheck(String param) {
        XxlJobHelper.log("Starting timeout order check, param: {}", param);
        // business logic...
        return ReturnT.SUCCESS;
    }
}
```

> The string in `@XxlJob` is the `JobHandler` name — it must match the name entered when creating the job in the XXL-Job admin console. Returning `ReturnT.SUCCESS` signals success; `ReturnT.FAIL` triggers an alert.

---

## 11. IM Instant Messaging Standards

### 1. Add Dependency

```xml
<dependency>
    <groupId>com.hswl</groupId>
    <artifactId>hs-common-im</artifactId>
    <version>4.0.2</version>
</dependency>
```

### 2. Configure Service Endpoint

```yaml
rest:
  services:
    im-service:
      domain: http://im-service:8080 # IM service URL; module is disabled if omitted
```

> `hs-common-im` uses a `MessageCondition` conditional check: the `MessageTemplate` bean is only registered in the container when `rest.services.im-service.domain` is present.

### 3. Inject and Use MessageTemplate

```java
@Autowired
private MessageTemplate messageTemplate;
```

**Common operation examples:**

```java
// Send a system message
SendMsgReqDTO req = new SendMsgReqDTO();
req.setToUserId("user123");
req.setContent("You have a new notification");
messageTemplate.sendSystemMsg(req);

// Create a group
CreateGroupReqDTO createReq = new CreateGroupReqDTO();
createReq.setGroupName("Transport-Group-001");
createReq.setOwnerId("user123");
ApiResponse<GroupInfoVO> resp = messageTemplate.createGroup(createReq);

// Add group members
GroupUserReqDTO addReq = new GroupUserReqDTO();
addReq.setGroupId("group001");
addReq.setUserIds(Arrays.asList("user456", "user789"));
messageTemplate.addGroupMember(addReq);

// Query group info
ApiResponse<GroupInfoVO> groupInfo = messageTemplate.getGroupInfo("group001");
```

---

## 12. UserContext Usage Standards

The gateway layer writes user information into `UserContext`. Business code reads it via static methods — no injection needed.

```java
import com.hswl.core.context.UserContext;

// Get the current logged-in user ID
Long userId = UserContext.getUserId();

// Get the account ID
Long accountId = UserContext.getAccountId();

// Get the scene ID (corresponds to roles: shipper, truck owner, admin, etc.)
Long sceneId = UserContext.getSceneId();

// Check whether this is an internal service-to-service call (bypasses auth)
Boolean isInternal = UserContext.getInternalRequest();
```

**Important notes:**

- `UserContext` is backed by `ThreadLocal`. The framework automatically calls `UserContext.removeUser()` at the end of each request. **Business code must never call `removeUser()` manually.**
- In async threads (`@Async`, thread pools), `ThreadLocal` values are not propagated automatically — user context must be passed manually.

---

## 13. ApiResponseBuilder Standards

`ApiResponseBuilder` provides a unified response-wrapping mechanism that automatically distinguishes between business exceptions (`BusinessException`) and system exceptions, eliminating repetitive try-catch blocks in every controller method.

### 1. Recommended Usage — execute Wrapper

```java
// ✅ Recommended: wrap controller methods with execute
@PostMapping("/create")
public ApiResponse<OrderVO> create(@RequestBody @Valid CreateOrderReq req) {
    return ApiResponseBuilder.execute(() -> orderService.create(req));
}
```

Exception handling behavior:

- `BusinessException` thrown → response uses the exception's `code` + `message`
- Any other exception thrown → response uses the `FAIL` error code, hiding internal details

### 2. Building Responses Directly

```java
// Build a success response
ApiResponse<OrderVO> resp = ApiResponseBuilder.success(orderVO);

// Build a failure response
ApiResponse<Void> err = ApiResponseBuilder.failed(e);
```

### 3. Custom Error Codes (CustomResponseMessage)

When the business needs to return a specific error code, use `CustomResponseMessage`:

```java
import com.hswl.core.response.CustomResponseMessage;

// Use with Assert (recommended)
Assert.isTrue(order != null, new CustomResponseMessage("20001", "Order not found"));

// Or throw directly
throw new BusinessException(new CustomResponseMessage("20001", "Order not found"));
```
