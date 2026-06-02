#!/usr/bin/env bash
# verify-test-fails.sh
# Run a specific test and confirm it FAILS — the Step 2 check in the TDD cycle.
# Exits 0 if the test failed (expected), 1 if it passed (bad — means the test
# isn't really testing the new behavior).
#
# Usage: ./verify-test-fails.sh <TestClass>#<testMethod>
# Example: ./verify-test-fails.sh OrderControllerTest#postOrder_returnsCreatedOrder

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <TestClass>#<testMethod>" >&2
  exit 2
fi

TEST_SPEC="$1"
TEST_CLASS="${TEST_SPEC%%#*}"
TEST_METHOD="${TEST_SPEC#*#}"

echo "Running test (expecting failure): $TEST_SPEC"
echo

# Capture output; allow failure (we WANT it to fail)
set +e
output=$(./mvnw test -Dtest="$TEST_SPEC" 2>&1)
exit_code=$?
set -e

echo "$output"
echo

if [[ $exit_code -eq 0 ]]; then
  echo "✗ FAIL: test passed when it should have failed."
  echo "   This means the test isn't actually testing the new behavior."
  echo "   Rewrite the test before continuing the TDD cycle."
  exit 1
fi

# Check for "good" failure reasons (compilation, 404, missing bean, etc.)
if echo "$output" | grep -Eq "(cannot find symbol|class .* not found|404|no qualifying bean|Tests run: [0-9]+, Failures: [1-9])"; then
  echo "✓ Test failed for the expected reason. Proceed to Step 3."
  exit 0
fi

echo "⚠  Test failed, but the failure reason is unclear:"
echo "   - Not a compilation error"
echo "   - Not a 404 / missing bean"
echo "   - Not an assertion failure"
echo "   Inspect the output above to confirm this is a real failure of the new behavior,"
echo "   not an unrelated test infrastructure issue (DB connection, port conflict, etc)."
exit 0
