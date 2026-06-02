#!/usr/bin/env bash
# Behavior eval runner — shared harness for all springboot-feature skills.
# Runs each prompt in a clean Java/Maven workspace with the skill injected as a system
# prompt, then inspects the workspace for the expected artifacts.
#
# Usage:
#   ./run-behavior.sh [--eval <path>] [--skill <name>] [--case <case-id>]
#
# Defaults (when run directly for the TDD skill):
#   --eval  ./behavior-eval.json
#   --skill test-driven-development
#
# Other skills delegate here, passing their own --eval and --skill values.
#
# Requires: claude CLI in PATH, jq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_FILE="${SCRIPT_DIR}/behavior-eval.json"
SKILL_NAME="test-driven-development"
WORKSPACE="/tmp/tdd-eval-workspace"
TEMPLATE_PROJECT="${SCRIPT_DIR}/../fixtures/sample-maven-project"   # optional; falls back to inline scaffold
CASE_FILTER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval)  EVAL_FILE="$2"; shift 2 ;;
    --skill) SKILL_NAME="$2"; shift 2 ;;
    --case)  CASE_FILTER="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found" >&2
  exit 1
fi

# Derive SKILL.md from the eval file path:
#   skills/<name>/evals/behavior-eval.json  ->  skills/<name>/SKILL.md
SKILL_MD="$(dirname "$(dirname "$(realpath "$EVAL_FILE")")")/SKILL.md"

if [[ ! -f "$SKILL_MD" ]]; then
  echo "ERROR: SKILL.md not found at $SKILL_MD" >&2
  exit 1
fi

case_total=$(jq '.cases | length' "$EVAL_FILE")
passed=0
failed=0

echo "SKILL: ${SKILL_NAME}"
echo "Running behavior eval (${case_total} cases)"
echo

for i in $(seq 0 $((case_total - 1))); do
  case_id=$(jq -r ".cases[$i].id" "$EVAL_FILE")
  [[ -n "$CASE_FILTER" && "$case_id" != "$CASE_FILTER" ]] && continue

  prompt=$(jq -r ".cases[$i].prompt" "$EVAL_FILE")
  echo "── case: $case_id ──"

  # Reset workspace
  if [[ -d "$WORKSPACE" ]]; then
    find "$WORKSPACE" -mindepth 1 -delete
  else
    mkdir -p "$WORKSPACE"
  fi

  if [[ -d "$TEMPLATE_PROJECT" ]]; then
    cp -r "$TEMPLATE_PROJECT/." "$WORKSPACE/"
  else
    mkdir -p "$WORKSPACE/src/main/java/com/example" "$WORKSPACE/src/test/java/com/example"
    cat > "$WORKSPACE/pom.xml" <<'POMEOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
  </parent>
  <groupId>com.example</groupId>
  <artifactId>eval-scaffold</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
POMEOF
    if command -v mvn >/dev/null 2>&1; then
      ln -sf "$(command -v mvn)" "$WORKSPACE/mvnw"
    else
      echo "  WARN: mvn not found; ./mvnw calls inside the eval will fail"
    fi
  fi

  cd "$WORKSPACE"
  git init -q && git add -A && git commit -q -m "baseline" 2>/dev/null || true

  # Run Claude with the skill injected via --append-system-prompt.
  # --dangerously-skip-permissions lets Claude write files without prompts in this sandbox.
  output=$(claude --print \
    --dangerously-skip-permissions \
    --append-system-prompt "$(cat "$SKILL_MD")" \
    "$prompt" 2>&1 || true)

  case_passed=1

  # files_must_exist: every pattern must match at least one file
  files=$(jq -r ".cases[$i].expected_outputs.files_must_exist[]? // empty" "$EVAL_FILE")
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    if ! find . -path "*$pattern*" -print -quit 2>/dev/null | grep -q .; then
      echo "  ✗ expected file pattern not found: $pattern"
      case_passed=0
    fi
  done <<< "$files"

  # files_must_exist_any: at least one pattern must match
  any_patterns=$(jq -r ".cases[$i].expected_outputs.files_must_exist_any[]? // empty" "$EVAL_FILE")
  if [[ -n "$any_patterns" ]]; then
    any_found=0
    while IFS= read -r pattern; do
      [[ -z "$pattern" ]] && continue
      if find . -path "*$pattern*" -print -quit 2>/dev/null | grep -q .; then
        any_found=1
        break
      fi
    done <<< "$any_patterns"
    if [[ $any_found -eq 0 ]]; then
      echo "  ✗ none of the expected file patterns found (files_must_exist_any)"
      echo "     patterns: $(echo "$any_patterns" | tr '\n' ' ')"
      case_passed=0
    fi
  fi

  # test_file_mtime_before_impl_file
  check_mtime=$(jq -r ".cases[$i].expected_outputs.test_file_mtime_before_impl_file // false" "$EVAL_FILE")
  if [[ "$check_mtime" == "true" ]]; then
    test_file=$(find src/test -type f -newer ".git/index" 2>/dev/null | head -1)
    impl_file=$(find src/main -type f -newer ".git/index" 2>/dev/null | head -1)
    if [[ -n "$test_file" && -n "$impl_file" ]]; then
      test_time=$(stat -f %m "$test_file" 2>/dev/null || stat -c %Y "$test_file")
      impl_time=$(stat -f %m "$impl_file" 2>/dev/null || stat -c %Y "$impl_file")
      if [[ $test_time -gt $impl_time ]]; then
        echo "  ✗ test file mtime is AFTER impl file (TDD violated)"
        case_passed=0
      fi
    fi
  fi

  # step_2_output_must_contain: at least one marker must appear
  step2_markers=$(jq -r ".cases[$i].expected_outputs.step_2_output_must_contain[]? // empty" "$EVAL_FILE")
  if [[ -n "$step2_markers" ]]; then
    step2_found=0
    while IFS= read -r marker; do
      [[ -z "$marker" ]] && continue
      if echo "$output" | grep -qi "$marker"; then
        step2_found=1; break
      fi
    done <<< "$step2_markers"
    if [[ $step2_found -eq 0 ]]; then
      echo "  ✗ Step 2 failure output not found (expected one of: $(echo "$step2_markers" | tr '\n' '|' | sed 's/|$//'))"
      case_passed=0
    fi
  fi

  # step_4_output_must_contain: all markers must appear
  step4_markers=$(jq -r ".cases[$i].expected_outputs.step_4_output_must_contain[]? // empty" "$EVAL_FILE")
  while IFS= read -r marker; do
    [[ -z "$marker" ]] && continue
    if ! echo "$output" | grep -q "$marker"; then
      echo "  ✗ Step 4 output did not contain: $marker"
      case_passed=0
    fi
  done <<< "$step4_markers"

  # must_contain_in_output
  contains=$(jq -r ".cases[$i].expected_outputs.must_contain_in_output[]? // empty" "$EVAL_FILE")
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    if ! echo "$output" | grep -qi "$s"; then
      echo "  ✗ output did not contain: $s"
      case_passed=0
    fi
  done <<< "$contains"

  # must_not_contain_in_output
  not_contains=$(jq -r ".cases[$i].expected_outputs.must_not_contain_in_output[]? // empty" "$EVAL_FILE")
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    if echo "$output" | grep -qi "$s"; then
      echo "  ✗ output contained forbidden string: $s"
      case_passed=0
    fi
  done <<< "$not_contains"

  # test_file_must_contain / test_file_must_not_contain
  test_file_check=$(find src/test -type f -name "*.java" 2>/dev/null | head -1 || true)
  if [[ -n "$test_file_check" ]]; then
    must_have=$(jq -r ".cases[$i].expected_outputs.test_file_must_contain[]? // empty" "$EVAL_FILE")
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      if ! grep -q "$s" "$test_file_check" 2>/dev/null; then
        echo "  ✗ test file does not contain: $s"
        case_passed=0
      fi
    done <<< "$must_have"

    must_not=$(jq -r ".cases[$i].expected_outputs.test_file_must_not_contain[]? // empty" "$EVAL_FILE")
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      if grep -q "$s" "$test_file_check" 2>/dev/null; then
        echo "  ✗ test file contains forbidden: $s"
        case_passed=0
      fi
    done <<< "$must_not"
  fi

  # commit assertions
  commits_required=$(jq -r ".cases[$i].expected_outputs.commits_must_exist // 0" "$EVAL_FILE")
  if [[ "$commits_required" -gt 0 ]]; then
    commit_count=$(git log --oneline --since="1 minute ago" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$commit_count" -lt "$commits_required" ]]; then
      echo "  ✗ expected $commits_required commit(s), found $commit_count"
      case_passed=0
    fi
  fi

  commit_pattern=$(jq -r ".cases[$i].expected_outputs.commit_message_must_match // empty" "$EVAL_FILE")
  if [[ -n "$commit_pattern" ]]; then
    latest_msg=$(git log --format="%s" -1 2>/dev/null || true)
    if ! echo "$latest_msg" | grep -qE "$commit_pattern"; then
      echo "  ✗ commit message \"$latest_msg\" does not match pattern: $commit_pattern"
      case_passed=0
    fi
  fi

  if [[ $case_passed -eq 1 ]]; then
    echo "  ✓ all assertions passed"
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
done

echo
echo "RESULT: ${passed}/$((passed + failed)) cases passed"
[[ $failed -gt 0 ]] && exit 1 || exit 0
