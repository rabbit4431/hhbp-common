---
name: cross-service-review
description: Test mock of the cross-service-review phase skill for springboot-feature-bootstrap behavior evals.
---

# cross-service-review (test mock)

This is a stand-in used by the springboot-feature-bootstrap behavior eval. Do not do any real work for this phase.

1. Append the line `cross-service-review` to the file `.mock-invocations` in the current working directory.
2. Leave `feature-state.json` unchanged. The phase keeps running in the background, so its `phase_status` stays `in_progress`.
3. Reply with one line: `MOCK cross-service-review started; phase_status remains in_progress.`
