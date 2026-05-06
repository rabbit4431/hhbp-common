---
name: slow-sql-optimize
description: >
  Fetch slow SQL logs from Tencent Cloud DBBrain, run EXPLAIN on problematic
  queries (full table scans, high avg rows examined), and output index
  optimization suggestions with an analysis report.
  Trigger when the user says: "optimize slow SQLs", "analyze DBBrain slow logs",
  "check full table scans", "find slow queries", or similar.
---

# Slow SQL Optimization

## Step 1 — Check Prerequisites

Run the following checks:

```bash
tccli --version
mysql --version
```

If `tccli` is missing, print:

```
tccli is not installed. Run:
  pip install tccli
  tccli configure   # enter SecretId, SecretKey, Region, output=json
```

If `mysql` is missing, detect the OS via `uname -s` and print the appropriate command:

- **Darwin** (macOS): `brew install mysql-client`
- **Linux** (Ubuntu/Debian): `sudo apt-get install -y mysql-client`
- **Linux** (CentOS/RHEL): `sudo yum install -y mysql`

Halt and ask the user to install the missing tool before continuing.

---

## Step 2 — Gather Configuration

Read configuration from environment variables. For each required variable that is not set, prompt the user.

| Env Var | Description | Default |
|---|---|---|
| `FREIGHT35_PROD_READONLY_INSTANCE_ID` | DBBrain instance ID (e.g. `mysql-xxxxxxxx`) | — (required) |
| `TENCENTCLOUD_REGION` | Tencent Cloud region (e.g. `ap-guangzhou`) | — (required) |
| `DBBRAIN_START_TIME` | Query start time (`YYYY-MM-DD HH:MM:SS`) | now − 24 h |
| `DBBRAIN_END_TIME` | Query end time (`YYYY-MM-DD HH:MM:SS`) | now |
| `DBBRAIN_TOP_N` | Max slow SQLs to fetch | `5` |
| `FREIGHT35_PROD_READONLY_MYSQL_HOST` | MySQL host | — (required) |
| `FREIGHT35_PROD_READONLY_MYSQL_PORT` | MySQL port | `3306` |
| `FREIGHT35_PROD_READONLY_MYSQL_USER` | MySQL user | — (required) |
| `FREIGHT35_PROD_READONLY_MYSQL_PASSWORD` | MySQL password | — (required) |

After resolving all values, print a configuration summary showing which values came from env and which were entered manually. Do not proceed until all required values are available.

---

## Step 3 — Fetch Slow SQL Top List

Ask the user to choose the sort dimension:

> How would you like to sort the slow SQL results? Choose one:
>   1. Execution count        (SortBy = ExecTimes)
>   2. Average execution time (SortBy = QueryTime)
>   3. Average scanned rows   (SortBy = RowsExamined)

Wait for the user's selection (accept number 1/2/3 or label text) and map:
- 1 → `ExecTimes`
- 2 → `QueryTime`
- 3 → `RowsExamined`

Then call the DBBrain API with the chosen sort value:

```bash
tccli dbbrain DescribeSlowLogTopSqls \
  --region $TENCENTCLOUD_REGION \
  --InstanceId $FREIGHT35_PROD_READONLY_INSTANCE_ID \
  --StartTime "DBBRAIN_START_TIME" \
  --EndTime "DBBRAIN_END_TIME" \
  --SortBy {CHOSEN_SORT_BY} \
  --Limit DBBRAIN_TOP_N \
  --Product mysql
```

Parse the JSON response. For each item in `Rows`, extract:

| Field | Meaning |
|---|---|
| `SqlText` | SQL template (with `?` placeholders) |
| `SqlSample` | A real SQL execution with actual values |
| `AvgExaminedRows` | Average rows scanned per execution |
| `AvgQueryTime` | Average query duration (seconds) — multiply × 1000 for ms |
| `ExecTimes` | Total execution count in the period |
| `SchemaName` | Database schema of the query |

If the API call fails, print the full error response and halt.

---

## Step 4 — Filter Problematic SQLs

Discard any entry where the `SqlSample` field contains the substring `log` or `message`
(case-insensitive). These are typically internal audit/logging queries not relevant for
index optimization.

Retain all remaining entries for EXPLAIN analysis.

Print a summary table of the retained SQLs before proceeding:

```
Slow SQLs to analyze: M of N retained
────────────────────────────────────────────────────────────────────────────────
 #   SQL (first 60 chars)                          AvgRows    AvgTime  Execs
────────────────────────────────────────────────────────────────────────────────
 1   SELECT * FROM orders WHERE status = 'PENDING'  85,420    3,200ms  1,240
 2   SELECT id FROM freight WHERE created_at > …    42,100      980ms    380
────────────────────────────────────────────────────────────────────────────────
```

If all SQLs are filtered out, print "All fetched SQLs were excluded by the keyword filter." and stop.

---

## Step 5 — Run EXPLAIN

For each qualifying SQL, use the `SqlSample` field (a real SQL with actual parameter values — no placeholder replacement needed).

Connect to the database using the `SchemaName` returned by the API for that specific SQL entry — this is the schema the query actually ran against.

Run EXPLAIN FORMAT=JSON:

```bash
mysql -h $FREIGHT35_PROD_READONLY_MYSQL_HOST \
  -P $FREIGHT35_PROD_READONLY_MYSQL_PORT \
  -u $FREIGHT35_PROD_READONLY_MYSQL_USER \
  -p$FREIGHT35_PROD_READONLY_MYSQL_PASSWORD \
  -D {SchemaName} \
  -e "EXPLAIN FORMAT=JSON SqlSample" 2>&1
```

From the JSON result, extract per table access node:

| Field | Meaning |
|---|---|
| `access_type` | `ALL` = full table scan |
| `key` | Index used (`null` = none) |
| `rows_examined_per_scan` | Estimated rows scanned for this table |
| `used_columns` | Columns read from the table |
| `attached_condition` | WHERE predicates applied to this table |

If EXPLAIN fails for a SQL (syntax error, permission issue, missing table), skip it and note the error in the report.

---

## Step 6 — Identify Issues

For each SQL, flag the following problems:

| Condition | Label |
|---|---|
| `access_type = ALL` | Full table scan |
| `key = null` | No index used |
| `attached_condition` present but no index | Filter without index |
| SQL text contains `ORDER BY` and `Using filesort` in EXPLAIN Extra | Sort without index |
| SQL text contains `GROUP BY` and `Using temporary` in EXPLAIN Extra | Temp table for grouping |

Also extract candidate index columns from the original `SqlText`:

- `WHERE col = ?` or `col IN (?)` → equality candidate (place first in index)
- `WHERE col > ?`, `col < ?`, `col BETWEEN` → range candidate (place after equalities)
- `ORDER BY col [ASC|DESC]` → covering index tail
- `GROUP BY col` → covering index tail
- `JOIN … ON t1.col = t2.col` → foreign key index candidate on the smaller/joining table

---

## Step 7 — Generate Index Suggestions

For each problematic SQL, produce a `CREATE INDEX` statement following these rules:

1. **Column order**: equality columns first → range columns → ORDER BY / GROUP BY columns
2. **Index name**: `idx_{table}_{col1}_{col2}` (snake_case, keep short)
3. **One index per table per SQL** — combine multiple filter columns into one composite index
4. **Skip** if EXPLAIN already shows a suitable index being used

Output format for each suggestion:

```sql
-- SQL #N: {table} {issue label} ({AvgExaminedRows} avg rows)
-- Condition: {extracted WHERE / JOIN predicates}
-- Suggestion: composite index on ({columns})
CREATE INDEX idx_{table}_{cols} ON {table}({col1}, {col2}, ...);
-- Expected: reduces scanned rows from ~{before} to ~{after} per query
```

---

## Step 8 — Output Analysis Report

Print the full report after all SQLs are analyzed:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slow SQL Optimization Report
  Instance : FREIGHT35_PROD_READONLY_INSTANCE_ID
  Period   : DBBRAIN_START_TIME  ~  DBBRAIN_END_TIME
  Generated: {datetime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary
  Slow SQLs fetched      : N
  SQLs after keyword filter : M
  Full table scans found : K
  Index suggestions      : J

──────────────────────────────────────────────────
SQL #1 — {schema}.{table}  [{issue labels}]
──────────────────────────────────────────────────
Query:
  {SqlText (full)}

Stats:
  AvgExaminedRows : {value}
  AvgQueryTime    : {value} ms
  ExecTimes       : {value}

EXPLAIN (key columns):
  table   | access_type | key    | rows_examined | Extra
  --------|-------------|--------|---------------|------------------
  orders  | ALL         | NULL   | 85,420        | Using where

Issues  : Full table scan, Filter without index

Index suggestion:
  CREATE INDEX idx_orders_status_created_at ON orders(status, created_at);
  Expected: reduces scanned rows from ~85,000 to ~200 per query

... (repeat for each SQL) ...

──────────────────────────────────────────────────
Quick-apply Script
──────────────────────────────────────────────────
-- Apply all suggestions on your MySQL instance:
CREATE INDEX idx_orders_status_created_at ON orders(status, created_at);
CREATE INDEX idx_freight_created_at ON freight(created_at);
```

---

## Guiding Principles

- **Read-only**: never run `UPDATE`, `DELETE`, `INSERT`, or `ALTER TABLE` against the database. Only `EXPLAIN` and `SHOW` statements are allowed.
- **SqlSample over SqlText**: always use `SqlSample` for EXPLAIN — it contains real values and avoids placeholder syntax errors.
- **One composite index per table**: combine multiple filter columns rather than suggesting multiple single-column indexes.
- **Equality before range**: always put equality-filtered columns before range-filtered columns in composite indexes.
- **Report skipped SQLs**: if EXPLAIN fails for a SQL, include it in the report with the error reason rather than silently dropping it.
