#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../../test-driven-development/evals/run-trigger.sh" \
  --eval "${SCRIPT_DIR}/trigger-eval.json" \
  --skill "feature-workspace-setup" \
  "$@"
