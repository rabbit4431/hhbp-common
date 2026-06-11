# Agentic Search (primary verification)

Service discovery's **primary** technique for confirming ownership and catching drift. The
`freight35/CLAUDE.md` index routes you to candidate services; these searches prove — against the live
code — that the routing is current. The live tree is always fresh; a pre-built index is not.

## Setup assumption

`freight35` is checked out at `<REPO_ROOT>` (see SKILL.md `<repo_root>` for the per-OS default).
Scope searches to the candidate service (`<REPO_ROOT>/<service>/`), not the whole repo, to keep them fast.

## Per-cluster layout — search the right place

The one repo holds three layout styles. Target the right path for the service's cluster:

| Cluster | Layout | Where the signal lives |
|---|---|---|
| Freight ops (DDD) | `<svc>-api / -domain / -application / -infrastructure / -service` | endpoints in `<svc>-application/**/facade/controller`; entities in `<svc>-domain/**/entity` |
| Identity (auth, user, org, permission, role, tenant) | single-module, flat `src/` (some wrap `<svc>-service`) | grep the whole service dir |
| Bank channels (channel, adapter-*) | JDK 8 / Spring Boot 2.5 / MyBatis / Flyway | handlers + `ChannelRequest`/`ChannelResponse`; migrations in `db/migration` |

## Discovery patterns

### Services exposing an endpoint

```bash
rg -l --type java '@(Get|Post|Put|Delete|Patch)Mapping\("[^"]*<keyword>[^"]*"\)' <REPO_ROOT>/<service>/
```

### Services consuming an event

freight35 freight services use **RabbitMQ** (`@MQConsumer`, classes implementing `MessageConsumer`),
not Kafka. Search both forms:

```bash
rg -l --type java '@MQConsumer|implements MessageConsumer' <REPO_ROOT>/<service>/   # RabbitMQ
rg -l --type java '@KafkaListener\(topics\s*=\s*"<topic>"' <REPO_ROOT>/<service>/   # Kafka (if present)
```

### Services producing an event

```bash
rg -l --type java 'convertAndSend\("[^"]*<topic>|kafkaTemplate\.send\("<topic>"' <REPO_ROOT>/<service>/
rg -oN --no-filename 'freight\.[a-z.]+' <REPO_ROOT>/<service>/                       # routing keys in use
```

### Services calling another service (static deps)

```bash
rg -oN --no-filename 'Remote[A-Za-z]+(Client|Service)' <REPO_ROOT>/<service>/ | sort -u
rg -l --type java '@FeignClient' <REPO_ROOT>/<service>/
```

### Services using a specific entity / DTO

```bash
rg -l --type java 'class <ClassName>' <REPO_ROOT>/                                   # owner
rg -l --type java '<ClassName>\b' <REPO_ROOT>/                                       # all references
```

## Reading the results

- A controller/consumer/entity hit in service X **confirms** the card that routed you there.
- A hit in service Y when the card said X is **drift** — record it as a finding and recommend a
  CLAUDE.md update (Step 6). This is exactly how the production-means config (transport) vs
  calculation (transport-resource) split was caught.
- No hits where the card expected them: re-read the card; the feature may be genuinely new
  (the factor/field does not exist yet) — itself a useful scoping fact.

## Limitations (and what closes them)

- **Static only** — grep finds call sites, not runtime-resolved (Nacos) edges. Close with the live
  registry query (see `claude-md-hierarchy.md`).
- **No criticality/ownership metadata** — that lives in the CLAUDE.md cards, not the code.
