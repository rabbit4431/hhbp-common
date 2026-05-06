---
name: remove-unused-class
description: >
  Find and remove unused Java classes in Maven multi-module projects.
  Triggers when the user asks to find dead code, clean up unused classes, delete unused Java files,
  or audit redundant code in Java/Spring/Maven projects.
  Also applies to phrasings like "find classes that are never referenced", "clean up dead code",
  "delete unused DTOs/Mappers/Enums", etc.
  This skill only scans src/main/java, classifies candidates into safely deletable
  vs. framework-managed (Spring Beans, Feign Clients in *-api modules),
  requests user confirmation before deletion — asking individually for low-confidence classes —
  and verifies project integrity via Maven compilation.
---

# Find and Remove Unused Java Classes

## Overview

This skill performs a safe, interactive cleanup of unused Java classes in a Maven project.
The guiding principle is conservative by default: when in doubt, ask the user rather than act.

## Step 1 — Confirm Parameters

**maven_settings path:** `$ARGUMENTS`

- If the path above **is filled in** (not empty, not the literal `$ARGUMENTS`): use it as-is; append `-s <path>` to all subsequent `mvn` commands.
- If the path above **is empty**: ask the user:

```
Do you have a custom Maven settings.xml path?
(e.g. /Users/sunchao/hs/maven/settings.xml — press Enter to skip)
```

Wait for the user's answer before proceeding. If skipped, run `mvn` commands without `-s`.

> Invocation example: `/remove-unused-class /Users/sunchao/hs/maven/settings.xml`

---

## Step 2 — Scan for Unused Classes

Traverse all modules' `src/main/java` directories (excluding `src/test/java`).

For each `.java` file, extract the **simple class name** (filename without `.java`),
then search the entire project to see if that name appears in any other file —
including imports, type references, annotation values, or instantiations.

If the simple class name has **zero references** outside its own file, treat it as an **unused candidate**.

> Note: This is a text-based heuristic analysis and cannot detect references made via reflection,
> dynamic class loading (`Class.forName`), XML/YAML bean definitions, or Spring component scanning.
> The classification step below handles such cases.

---

## Step 3 — Classify Candidates

Classify candidates into three categories:

### 🔴 External API Modules — Do Not Delete

Modules whose names end in `-api` (e.g. `transaction-api`, `coupon-api`)
are published SDKs consumed by other microservices. These classes may appear unused within this repo
but are referenced externally. **Exclude the entire `-api` module from deletion.**

Includes:

- `Remote*Client` (Feign clients)
- DTOs and enums under api module packages

### 🟡 Spring / Framework-Managed — Do Not Delete

These classes appear unused in static analysis but are auto-wired by the framework at runtime:

| Annotation / Naming Pattern               | Example                             |
| ----------------------------------------- | ----------------------------------- |
| `@RestController`, `@Controller`          | HTTP endpoints                      |
| `@Service`, `@Component`, `@Bean`         | Spring beans injected via interface |
| `@Repository` / `*RepositoryImpl`         | Spring Data repositories            |
| `@Configuration`                          | Configuration classes               |
| `@RabbitListener`, `*Consumer`            | Message queue consumers             |
| `@XxlJob`, `*Job`                         | Scheduled job handlers              |
| `@SpringBootApplication` / `*Application` | Boot entry points                   |
| `@EventListener`, `*EventListener`        | Spring event listeners              |
| `*Producer` (with `@Component`)           | MQ producers                        |

If a candidate matches any of the above, add it to the "Spring-managed" list and **do not propose deletion**.

### 🟢 Truly Unused — Propose Deletion

All remaining classes: DTOs, request/response objects, Mappers, Assemblers, enums, value objects,
pure domain Factories, domain Services with no callers, MQ Payload classes with no references,
AppService classes with no Controller or test callers.

---

## Step 4 — Flag Low-Confidence Classes

Before showing the final list, identify low-confidence classes. Ask individually (one-by-one confirmation) if any of the following apply:

- It is a **domain event** (`*Event`) — there may be an `@EventListener` consumer that text search cannot find
- It is a **domain Service** — may be called via interface injection
- It is a **Factory** — may be used via reflection or in tests
- The class name appears in non-Java files (e.g. `application.yml`, XML config, SQL scripts)
- The class **implements an interface** whose other implementations are clearly Spring Beans
  (suggesting this class may also be a Spring Bean missing an annotation)
- It is a **Payload / Message class** — may be deserialized by a consumer in another service

For each flagged class, show an individual confirmation prompt:

```
⚠️  [ClassName] — Low Confidence
    Reason: <one-line explanation>
    File: <path>
    Include in deletion? (Yes / No / Skip)
```

Wait for the user's answer before proceeding.

---

## Step 5 — Display Deletion List for Confirmation

After processing all low-confidence classes, show the full deletion list grouped by module:

```
The following N classes appear unused and are proposed for deletion:

transaction-application
  src/main/java/.../dto/rsp/AccountBalanceRspDTO.java
  src/main/java/.../mapper/CouponAccountDTOMapper.java
  ...

transaction-domain
  src/main/java/.../vo/GenderEnum.java
  ...

transaction-infrastructure
  src/main/java/.../assembler/VirtualAccountAssembler.java
  ...

Excluded (Spring-managed, kept): [N] classes
Excluded (External API module): [N] classes

Confirm deletion of the above N files? (Yes / No)
```

**Do not delete any files until the user explicitly confirms.**

---

## Step 6 — Delete Confirmed Files

Once the user confirms, delete all files in the list. Print a summary: `Deleted N files.`

---

## Step 7 — Verify Build Integrity

Run Maven compilation to confirm the project still builds successfully:

```bash
# No custom settings provided:
mvn clean compile -T 4

# Custom maven_settings provided:
mvn clean compile -T 4 -s <maven_settings_path>
```

Interpret the output:

- **BUILD SUCCESS** — Report per-module compilation success and confirm no compile errors were introduced.
- **BUILD FAILURE** — Display the specific error output. Diagnose the cause: was it a missing reference from a deleted class, or a pre-existing issue (e.g. inaccessible private dependency, network error)?
  If caused by a deleted class, tell the user which file to restore (`git checkout <path>`) and where it was referenced.

---

## Result Report Format

Output a concise final summary:

```
✅ Cleanup Complete
   Deleted:            N classes
   Spring-managed:     N classes (kept)
   External API module: N classes (kept)
   Low-confidence:     N classes (user confirmed)
   Build:              SUCCESS / FAILURE
```

If BUILD FAILURE, append a `⚠️  Next Steps:` section describing what needs to be fixed.

---

## Guiding Principles

- **Conservative by default.** When evidence is ambiguous, keep the class and explain why.
- **Briefly explain each classification decision** — the user should understand why a class is proposed for deletion or kept.
- **Never delete Spring-managed beans.** Static analysis cannot see Spring's runtime wiring.
- **Never delete classes in `-api` modules.** These are shared contracts with other services.
- **Always verify with Maven after deletion.** The build result is the final authority.
