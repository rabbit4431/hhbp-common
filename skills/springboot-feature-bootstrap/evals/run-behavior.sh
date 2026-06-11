#!/usr/bin/env bash
# Behavior eval runner for springboot-feature-bootstrap.
# This skill orchestrates other skills, so behavior evals need to:
# 1. Set up a pre_state in feature-state.json before each case
# 2. Use mock sub-skills (in fixtures/mock-skills/) so we test orchestration, not the sub-skill output
# 3. Verify which sub-skill was invoked + how state was updated

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "NOTE: bootstrap behavior evals require mock sub-skills."
echo "Mock sub-skills should be installed at ~/.claude/skills-test/ before running."
echo "See evals/README.md for details."
echo

exec "${SCRIPT_DIR}/../../test-driven-development/evals/run-behavior.sh" \
  --eval "${SCRIPT_DIR}/behavior-eval.json" \
  --skill "springboot-feature-bootstrap" \
  --use-mock-skills \
  "$@"
