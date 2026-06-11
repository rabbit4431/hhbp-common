# CLAUDE.md Hierarchy Design — freight35 monorepo

Design for a layered agent-context system in the consolidated `freight35` repository, following the
**AGENTS.md (Codex) convention** and expressed as `CLAUDE.md` files, each capped at **200 lines**.

`freight35` is a single repo of ~54 Spring Boot services (formerly split across freight35,
freight35-user-center, and freight35-channel-center). The hierarchy is **two levels**: one repo-root
index + one card per service, all flat.

---

## 1. AGENTS.md convention applied

The [agents.md](https://agents.md) standard that Codex follows defines the rules below; here is how
each maps onto this CLAUDE.md hierarchy:

| AGENTS.md convention | How we apply it |
|---|---|
| **One markdown file, agent-oriented** | One canonical file per directory; lean orientation, not API docs |
| **Root + nestable in any subdirectory** | A file at the repo root and one per service directory |
| **Nearest file wins** | Editing `freight35/transport/...` stacks root + service file; the service file specializes |
| **Scope = the subtree under the file** | A service file governs only that service; the root governs the repo |
| **Standard sections** | Overview, build/test, conventions, security — stated once at the root (see §4) |

### Codex <-> Claude Code interop

Codex reads `AGENTS.md`; Claude Code reads `CLAUDE.md`. Keep one source of truth: `CLAUDE.md` is the
real file, with a relative `AGENTS.md -> CLAUDE.md` symlink beside it at each level.

---

## 2. The hierarchy (tree form)

```
freight35/
├── CLAUDE.md                     ◀ ROOT  (<=200 lines)   principles + 54-service index
│   └─ AGENTS.md → CLAUDE.md                              grouped by domain cluster
│
├── transport/CLAUDE.md           ◀ SERVICE (<=80)  freight cmds/bills, production-means CONFIG
│   └── .../domain/CLAUDE.md       ◀ DEEP (rare, <=60)  only a thorny module
├── transport-resource/CLAUDE.md  ◀ SERVICE  waybill production-means: allocate + calculate
├── transaction/CLAUDE.md         ◀ SERVICE  accounts, withdrawals, channels (渠道)
├── settlement/CLAUDE.md          ◀ SERVICE  billing, 平台运差 / 平台管理费
├── truck/  product/  ...         ◀ remaining freight-ops services (one card each)
│
├── auth/CLAUDE.md                ◀ SERVICE  authentication / token issuance   (ex user-center)
├── hs-user-service/CLAUDE.md     ◀ SERVICE  core user
├── hs-permission-service/CLAUDE.md  ◀ SERVICE  permissions (security-critical)
├── hs-role-service/  hs-tenant-service/  hs-organization-service/  ...  ◀ 14 identity services
│
├── channel/CLAUDE.md             ◀ SERVICE  gateway routing to adapters        (ex channel-center)
├── adapter-standard/CLAUDE.md    ◀ SERVICE  15 handler ifaces, ChannelRequest/Response
├── adapter-cmbc/CLAUDE.md        ◀ SERVICE  China Minsheng Bank (民生银行)
└── adapter-pab/CLAUDE.md         ◀ SERVICE  Ping An Bank (平安银行)
```

> 54 services = 36 freight-ops + 14 identity + 4 bank-channel, all flat under `freight35/`.
> `logs/`, `target/` are runtime/build output — no CLAUDE.md.

---

## 3. Per-level specification

| Level | File | Focus (its one job) | Budget | Sections |
|---|---|---|---|---|
| **Root** | `freight35/CLAUDE.md` | Principles + **service index** = the router | <=200 | Overview, Build/Test, Module layouts, Stack invariants, Service index, Cross-cutting traps |
| **Service** | `freight35/<svc>/CLAUDE.md` | The service's **ID card**: owns / entry points / deps | <=80 | Owns, Does NOT own, Entry points, Feign+MQ deps, Gotchas |
| **Deep (rare)** | `freight35/<svc>/<mod>/CLAUDE.md` | One thorny subsystem's non-obvious rules | <=60 | Only the local rule |

**Default to Root + Service.** Add a Deep file only when a module repeatedly burns exploration time.

### Mixed stacks in one repo

The root must note that the repo is not uniform: freight-ops services are DDD multi-module +
RabbitMQ; identity services are single-module flat `src/`; bank-channel adapters are JDK 8 /
Spring Boot 2.5 / MyBatis / Flyway. Service cards inherit this — they don't repeat it.

---

## 4. Section-placement matrix — the rule that keeps every file <=200 lines

State each fact **once, at the highest level where it is true.** The nearest-wins convention stacks
the root into context automatically, so a service card must never repeat what the root says. That
deduplication is both the AGENTS.md precedence model and the line-budget solution.

| Fact / section | Stated at | Never repeated at |
|---|---|---|
| Security rules, immutability, TDD, English | Root | Service |
| Module layouts (DDD / single-module / channel), build/test, Nacos, messaging | Root | Service |
| The 54-service index grouped by domain | Root | Service |
| What one service owns, its entry files, its deps | Service | — |
| A single module's special rule | Deep | — |

### Durable vs volatile (also a line-budget lever)

CLAUDE.md holds **slow-changing** facts only. Volatile detail (exact endpoint lists, DTO field names,
method bodies) stays in live grep — which keeps files short and prevents staleness. When durable
content for one area still exceeds budget, **link out** to an on-demand doc instead of inlining.

---

## 5. Service-card template (apply to every service)

```markdown
# <service>

<one-line domain responsibility>

## Owns
- <key entities / aggregates / enums>

## Does NOT own
- <boundary clarification → points to the service that does>

## Entry points
- <main controller(s)> ; <key domain service>

## Talks to
- Feign: <services>
- MQ: consumes <queue> / produces <topic>      (omit for non-messaging services)

## Gotchas
- <non-obvious rule that would mislead a fresh reader>
```

Everything else (build, test, style, security, module layout) is inherited from the root and is
deliberately absent here.

---

## 6. Migration checklist (manual)

When flattening the three repos into `freight35/`:
1. `mv` each service dir from `freight35-user-center/` and `freight35-channel-center/` into `freight35/`.
2. Fold the two dissolved repo-root indexes into the single `freight35/CLAUDE.md` 54-service index;
   remove the old root files.
3. Add a service card (§5) for each of the 18 newly-moved services.
4. Add a relative `AGENTS.md -> CLAUDE.md` symlink beside each new CLAUDE.md.
