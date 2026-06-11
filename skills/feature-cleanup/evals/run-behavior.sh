#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../../test-driven-development/evals/run-behavior.sh" \
  --eval "${SCRIPT_DIR}/behavior-eval.json" \
  --skill "feature-cleanup" \
  "$@"
