# Spring Boot Test Patterns

Reference examples for the test-driven-development skill. Loaded on demand when the skill needs to write a test in a specific Spring Boot context.

## Controller tests — `@WebMvcTest`

Use for testing a single controller. Mock the service layer.

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockBean
    OrderService orderService;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void postOrder_returnsCreatedOrder() throws Exception {
        OrderRequest request = new OrderRequest(150.00, "gold");
        Order created = new Order("o-1", 150.00, 7.50);
        when(orderService.createOrder(any())).thenReturn(created);

        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value("o-1"))
            .andExpect(jsonPath("$.discount").value(7.50));
    }
}
```

## Repository tests — `@DataJpaTest`

Use for testing JPA queries against an in-memory database.

```java
@DataJpaTest
class OrderRepositoryTest {

    @Autowired
    OrderRepository repository;

    @Autowired
    TestEntityManager em;

    @Test
    void findByCustomerTier_returnsMatchingOrders() {
        em.persist(new Order("o-1", 150.00, "gold"));
        em.persist(new Order("o-2", 100.00, "silver"));

        List<Order> gold = repository.findByCustomerTier("gold");

        assertThat(gold).hasSize(1);
        assertThat(gold.get(0).getId()).isEqualTo("o-1");
    }
}
```

## Mapper tests — `@MybatisPlusTest`

Use for testing MyBatisPlus mapper methods against an in-memory H2 database. Fast and isolated — loads only mappers, no full context.

```java
@MybatisPlusTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
class OrderMapperTest {

    @Autowired
    OrderMapper orderMapper;

    @Test
    void selectByCustomerTier_returnsMatchingOrders() {
        Order order = new Order();
        order.setId("o-1");
        order.setAmount(new BigDecimal("150.00"));
        order.setCustomerTier("gold");
        orderMapper.insert(order);

        List<Order> gold = orderMapper.selectByCustomerTier("gold");

        assertThat(gold).hasSize(1);
        assertThat(gold.get(0).getId()).isEqualTo("o-1");
    }
}
```

`@AutoConfigureTestDatabase(replace = ANY)` forces H2 even when a real datasource is configured. Requires `com.baomidou:mybatis-plus-boot-starter-test`.

## Kafka listener tests — `@EmbeddedKafka`

Use for testing `@KafkaListener` methods against a real (embedded) Kafka.

```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = {"order.created"})
class OrderEventListenerTest {

    @Autowired
    KafkaTemplate<String, OrderCreatedEvent> kafkaTemplate;

    @MockBean
    NotificationService notificationService;

    @Test
    void onOrderCreated_sendsNotification() throws Exception {
        OrderCreatedEvent event = new OrderCreatedEvent("o-1", "user-1", 150.00);

        kafkaTemplate.send("order.created", event).get(5, TimeUnit.SECONDS);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            verify(notificationService).notifyOrderCreated("user-1", "o-1");
        });
    }
}
```

## RabbitMQ listener tests — `@SpringBootTest` + Testcontainers

Use for testing `@RabbitListener` methods. Spring has no embedded broker, so use `RabbitMQContainer` from Testcontainers — same await-and-verify pattern as the Kafka example.

```java
@SpringBootTest
@Testcontainers
class OrderEventListenerTest {

    @Container
    static RabbitMQContainer rabbit =
        new RabbitMQContainer("rabbitmq:3.13-management");

    @DynamicPropertySource
    static void config(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", rabbit::getHost);
        registry.add("spring.rabbitmq.port", rabbit::getAmqpPort);
    }

    @Autowired
    RabbitTemplate rabbitTemplate;

    @MockBean
    NotificationService notificationService;

    @Test
    void onOrderCreated_sendsNotification() {
        OrderCreatedEvent event = new OrderCreatedEvent("o-1", "user-1", 150.00);

        rabbitTemplate.convertAndSend("order.exchange", "order.created", event);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
            verify(notificationService).notifyOrderCreated("user-1", "o-1")
        );
    }
}
```

## Service tests — plain JUnit, no Spring context

Use for testing service logic in isolation. Faster than any Spring-context test.

```java
class DiscountServiceTest {

    DiscountService discountService = new DiscountService();

    @Test
    void calculateDiscount_goldTierOver100_returnsFivePercent() {
        BigDecimal discount = discountService.calculateDiscount(
            new BigDecimal("150.00"), "gold");

        assertThat(discount).isEqualByComparingTo("7.50");
    }

    @Test
    void calculateDiscount_silverTier_returnsZero() {
        BigDecimal discount = discountService.calculateDiscount(
            new BigDecimal("150.00"), "silver");

        assertThat(discount).isEqualByComparingTo("0.00");
    }
}
```

## Full-context integration tests — `@SpringBootTest`

Use sparingly. Slow startup. Only when you genuinely need the full wiring.

```java
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class OrderIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

    @DynamicPropertySource
    static void config(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
    }

    @Autowired
    MockMvc mockMvc;

    @Test
    void fullOrderFlow_createsOrderAndPersists() throws Exception {
        // ...
    }
}
```

## Choosing the right test type

| Goal | Use |
|---|---|
| Test request/response shape | `@WebMvcTest` |
| Test a query/repository method | `@DataJpaTest` |
| Test message consumption | `@EmbeddedKafka` + `@SpringBootTest` |
| Test a MyBatisPlus mapper/query | `@MybatisPlusTest` |
| Test a RabbitMQ listener | `@SpringBootTest` + `RabbitMQContainer` |
| Test pure business logic | Plain JUnit, no Spring |
| Test wired-up flow across layers | `@SpringBootTest` (last resort) |

Always start with the cheapest test type that proves the behavior. Faster tests = tighter feedback loop = better TDD experience.
