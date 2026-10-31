---
name: language-setup
description: >
  Choose the language HHBP uses for replies, plans, reports, commit message descriptions, and
  code comments. Trigger when the user asks to change or set the plugin/output language — e.g.
  "reply in French", "set the language to German", "change HHBP language", "langue", "Sprache" —
  or right after installing the plugin on a harness without an install-time prompt (Codex).
model: claude-sonnet-5-5
---

# Language Setup

Supported languages:

| Code | Language |
|---|---|
| `en` | English (default) |
| `fr` | Français (French) |
| `de` | Deutsch (German) |

## Step 1 — Ask

Show the table and ask the user which language they want. Accept a code or a language name in
any language, and map it to a code from the table. If it is not in the table, say so and ask again.

## Step 2 — Save

**Claude Code:** the setting is the plugin's `language` option, which takes precedence over any
other source. Tell the user to open `/plugin` → **Installed** → **hhbp-claude-code** →
**Configure options** (or `/config`) and pick the code. Do not write any file.

**Other harnesses (Codex):** write the code to `~/.hhbp/config.json`, keeping any other keys
already in the file:

```bash
mkdir -p ~/.hhbp
node -e '
const fs = require("fs"), f = require("os").homedir() + "/.hhbp/config.json";
let c = {}; try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) {}
c.language = process.argv[1];
fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n");
' <code>
```

## Step 3 — Confirm

Tell the user, in the chosen language, that the setting takes effect from the next session
(the language is applied by a SessionStart hook). `HHBP_LANGUAGE=<code>` in the environment
overrides the config file.
