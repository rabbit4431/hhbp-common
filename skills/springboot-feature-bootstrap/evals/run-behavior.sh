#!/usr/bin/env bash
# Behavior eval runner for springboot-feature-bootstrap.
#
# This skill orchestrates other skills, so each case runs against a throwaway REPO_ROOT:
#   1. A fresh git repo per case (REPO_ROOT, also exported as FREIGHT35_ROOT)
#   2. The nine phase skills installed as project skills from fixtures/mock-skills/, so we
#      test orchestration, not sub-skill output
#   3. pre_state (if any) seeded into features/<TICKET>/feature-state.json
#   4. Claude runs with this SKILL.md appended to the system prompt
#   5. Assertions on the state file, on which skills were invoked (Skill tool calls in the
#      stream-json transcript, plus the mocks' .mock-invocations log), and on the final reply
#
# Usage:
#   ./run-behavior.sh [--eval <path>] [--skill-dir <path>] [--case <id>]
#
# --skill-dir points at the skill under test (default: this skill), so the same runner can
# evaluate another revision of SKILL.md.
#
# Each case's workspace and transcript are kept under $HHBP_EVAL_WORKSPACE/<case-id>/.
#
# Requires: claude CLI in PATH, jq, git
# Set HHBP_EVAL_MODEL (e.g. claude-opus-5-5) to pin the model; unset uses the CLI default.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_FILE="${SCRIPT_DIR}/behavior-eval.json"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
MOCKS_DIR="${SCRIPT_DIR}/fixtures/mock-skills"
WORKSPACE_BASE="${HHBP_EVAL_WORKSPACE:-/tmp/bootstrap-eval-workspace}"
DEFAULT_TICKET="PROJ-1234"
CASE_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval)      EVAL_FILE="$2"; shift 2 ;;
    --skill-dir) SKILL_DIR="$(cd "$2" && pwd)"; shift 2 ;;
    --case)      CASE_FILTER="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for bin in claude jq git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: $bin not found in PATH" >&2; exit 1; }
done
[[ -f "$SKILL_DIR/SKILL.md" ]] || { echo "ERROR: SKILL.md not found in $SKILL_DIR" >&2; exit 1; }

echo "=== Behavior eval: springboot-feature-bootstrap ==="
echo "Skill:     $SKILL_DIR/SKILL.md"
echo "Eval file: $EVAL_FILE"
echo

case_total=$(jq '.cases | length' "$EVAL_FILE")
passed=0
failed=0

fail() { echo "  ✗ $*"; case_passed=0; }

for i in $(seq 0 $((case_total - 1))); do
  case_id=$(jq -r ".cases[$i].id" "$EVAL_FILE")
  [[ -n "$CASE_FILTER" && "$case_id" != "$CASE_FILTER" ]] && continue
  echo "── case: $case_id ──"

  prompt=$(jq -r ".cases[$i].prompt" "$EVAL_FILE")
  pre_state=$(jq -c ".cases[$i].pre_state // null" "$EVAL_FILE")
  expected=$(jq -c ".cases[$i].expected_outputs" "$EVAL_FILE")

  ticket=$(jq -r '.ticket // empty' <<<"$pre_state")
  [[ -z "$ticket" ]] && ticket=$(grep -oE 'PROJ-[0-9]+' <<<"$prompt" | head -1 || true)
  [[ -z "$ticket" ]] && ticket="$DEFAULT_TICKET"

  # ── fresh REPO_ROOT with mock phase skills ────────────────────────────────
  ws="${WORKSPACE_BASE}/${case_id}"
  rm -rf "$ws"
  mkdir -p "$ws/.claude/skills"
  cp -r "$MOCKS_DIR/." "$ws/.claude/skills/"
  # The skill's bundled references, so references/phase-dispatcher.md resolves.
  mkdir -p "$ws/.claude/skills/springboot-feature-bootstrap"
  cp -r "$SKILL_DIR/references" "$ws/.claude/skills/springboot-feature-bootstrap/"
  state_file="$ws/features/${ticket}/feature-state.json"

  if [[ "$pre_state" != "null" ]]; then
    mkdir -p "$(dirname "$state_file")"
    jq -n --arg t "$ticket" --argjson pre "$pre_state" '{
      ticket: $t, phase: "discovery", phase_status: "in_progress", services: [],
      services_confirmed: false, contracts_approved: false, review_approved: false,
      error_class: null, iterations: {integration_test: 0, review: 0}, max_iterations: 3,
      feedback_ref: null, completed_phases: [], artifacts: {}
    } + $pre' >"$state_file"
  fi
  (cd "$ws" && git init -q && git add -A && git commit -q -m "baseline" 2>/dev/null || true)
  initial_state=$(cat "$state_file" 2>/dev/null || echo null)

  context="EVALUATION CONTEXT: REPO_ROOT is ${ws}. The skill's bundled references are in ${ws}/.claude/skills/springboot-feature-bootstrap/references/."
  if [[ "$pre_state" != "null" ]]; then
    context+=" Feature ${ticket} is already in flight: its state is in features/${ticket}/feature-state.json, and the previous turn of this conversation ended at the phase recorded there. The user's next message follows."
  fi

  # ── run ───────────────────────────────────────────────────────────────────
  transcript="$ws/transcript.jsonl"
  (cd "$ws" && FREIGHT35_ROOT="$ws" claude --print ${HHBP_EVAL_MODEL:+--model "$HHBP_EVAL_MODEL"} \
    --dangerously-skip-permissions \
    --output-format stream-json --verbose \
    --append-system-prompt "$(cat "$SKILL_DIR/SKILL.md")" \
    "${context}
${prompt}" >"$transcript" 2>"$ws/stderr.txt" || true)

  output=$(jq -r 'select(.type=="result") | .result // empty' "$transcript" 2>/dev/null || true)
  invoked=$( {
    jq -r 'select(.type=="assistant") | .message.content[]?
           | select(.type=="tool_use" and .name=="Skill") | .input.skill' "$transcript" 2>/dev/null || true
    cat "$ws/.mock-invocations" 2>/dev/null || true
  } | sed 's/^.*://' | sort -u)
  final_state=$(cat "$state_file" 2>/dev/null || echo null)

  case_passed=1
  if [[ -z "$output" ]]; then fail "no final reply in transcript (see $ws/stderr.txt)"; fi

  # files_must_exist: paths relative to REPO_ROOT
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    [[ -e "$ws/$f" ]] || fail "file missing: $f"
  done < <(jq -r '.files_must_exist[]? // empty' <<<"$expected")

  # state_must_contain: each key equals the expected value
  while IFS=$'\t' read -r key want; do
    [[ -z "$key" ]] && continue
    got=$(jq -c --arg k "$key" '.[$k]' <<<"$final_state")
    [[ "$got" == "$want" ]] || fail "state.$key = $got, expected $want"
  done < <(jq -r '.state_must_contain // {} | to_entries[] | "\(.key)\t\(.value | tojson)"' <<<"$expected")

  # state_must_not_change: each key equals its seeded value
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    before=$(jq -c --arg k "$key" '.[$k]' <<<"$initial_state")
    after=$(jq -c --arg k "$key" '.[$k]' <<<"$final_state")
    [[ "$before" == "$after" ]] || fail "state.$key changed: $before → $after"
  done < <(jq -r '.state_must_not_change[]? // empty' <<<"$expected")

  # must_invoke_skill / must_not_invoke_skill(s)
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    grep -qxF "$s" <<<"$invoked" || fail "did not invoke $s (invoked: ${invoked//$'\n'/, })"
  done < <(jq -r '.must_invoke_skill // empty' <<<"$expected")
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    if grep -qxF "$s" <<<"$invoked"; then fail "invoked $s, which it must not"; fi
  done < <(jq -r '(.must_not_invoke_skill // empty), (.must_not_invoke_skills[]? // empty)' <<<"$expected")

  # must_contain_in_output: case-insensitive substrings of the final reply
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    grep -qiF "$s" <<<"$output" || fail "reply missing: \"$s\""
  done < <(jq -r '.must_contain_in_output[]? // empty' <<<"$expected")

  if jq -e '.should_suggest_next_actions == true' <<<"$expected" >/dev/null; then
    echo "  · should_suggest_next_actions: not auto-checked; read the reply in $transcript"
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
