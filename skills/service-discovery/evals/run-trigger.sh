#!/usr/bin/env bash
# Trigger eval runner — same shape as test-driven-development's runner.
# See ../../test-driven-development/evals/run-trigger.sh for the canonical version.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../../test-driven-development/evals/run-trigger.sh" \
  --eval "${SCRIPT_DIR}/trigger-eval.json" \
  --skill "service-discovery" \
  "$@"
