---
name: feature-cleanup
description: Test mock of the feature-cleanup phase skill for springboot-feature-bootstrap behavior evals.
---

# feature-cleanup (test mock)

This is a stand-in used by the springboot-feature-bootstrap behavior eval. Do not do any real work for this phase.

1. Append the line `feature-cleanup` to the file `.mock-invocations` in the current working directory.
2. Leave `feature-state.json` unchanged. The phase keeps running in the background, so its `phase_status` stays `in_progress`.
3. Reply with one line: `MOCK feature-cleanup started; phase_status remains in_progress.`
