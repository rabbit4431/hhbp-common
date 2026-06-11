# Reading the CLAUDE.md hierarchy for discovery

The hierarchy is the durable map that seeds discovery (Step 2). It replaces the old service catalog:
instead of querying a pre-built index that drifts, you read context docs that live next to the code
and are updated in the same PRs.

`freight35` is a single repo, so the hierarchy is **two levels**:

| Level | File | Read it for |
|---|---|---|
| **Repo root** | `<REPO_ROOT>/CLAUDE.md` | The **service index** — all services grouped by domain (Core freight / Identity / Channels / Money / BFF / Adapters / Infra); routes a domain noun to candidate services; stack invariants |
| **Service** | `<REPO_ROOT>/<service>/CLAUDE.md` | **Owns** / **Does NOT own** / **Entry points** / **Talks to** (Feign + MQ) / **Gotchas** |

Read top-down: the root index narrows to candidate services; each card confirms ownership and
surfaces boundaries. The **Does NOT own** section is the highest-value line — it redirects you to the
true owner of a boundary (e.g. transport-resource's card says config is owned by transport).

Full design: `claude-md-hierarchy-design.md`, bundled in this skill's `references/`. Worked example: the freight35
CLAUDE.md files (`<REPO_ROOT>/CLAUDE.md`, `<REPO_ROOT>/transport/CLAUDE.md`, ...).

## Durable vs volatile

| Trust the hierarchy for (durable) | Verify live instead (volatile) |
|---|---|
| Which service owns a domain | Exact endpoint paths and signatures |
| Feign/MQ topology (who talks to whom) | Specific DTO field names |
| Architectural traps / partial migrations | Current method bodies, routing-key strings |

Never quote the card for an exact endpoint or field — grep it (see `agentic-search.md`).

## Runtime wiring — the live Nacos query

Static `@FeignClient` annotations miss dependencies resolved at runtime via service discovery. Query
the live registry for the actual edges:

```bash
# All registered services
curl -s "http://${NACOS_SERVER_ADDR}:8848/nacos/v1/ns/catalog/services?pageNo=1&pageSize=200"

# Instances of one service (who is actually up, and metadata)
curl -s "http://${NACOS_SERVER_ADDR}:8848/nacos/v1/ns/instance/list?serviceName=<service>"
```

Use this in Step 4 to add runtime-only callers/callees to the "possibly in scope" bucket. Query the
source of truth (Nacos) live — do not mirror it into a static file, or you reintroduce the staleness
problem the catalog had.

## When a card is missing

If a candidate service has no CLAUDE.md card, there is nothing to read for it — go straight to pure
agentic search for that service and recommend creating the card. The hierarchy is maintained as a
byproduct of discovery: every missing or wrong card you hit is a one-line fix that makes the next run
faster.
