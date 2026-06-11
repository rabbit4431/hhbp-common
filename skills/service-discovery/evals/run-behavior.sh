#!/usr/bin/env bash
# Behavior eval runner — service-discovery.
# Standalone runner; does NOT delegate to the TDD harness because service-discovery
# has its own assertion types (rationale sections, state JSON, fixture workspaces).
#
# Usage:
#   ./run-behavior.sh [--eval <path>] [--skill <name>] [--case <case-id>]
#
# Requires: claude CLI in PATH (with --dangerously-skip-permissions for file-write cases), jq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_FILE="${SCRIPT_DIR}/behavior-eval.json"
SKILL_NAME="service-discovery"
CASE_FILTER=""
WORK_DIR="${HOME}/work/features"
FIXTURES_DIR="${SCRIPT_DIR}/fixtures/workspace"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval)  EVAL_FILE="$2"; shift 2 ;;
    --skill) SKILL_NAME="$2"; shift 2 ;;
    --case)  CASE_FILTER="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found" >&2; exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq not found" >&2; exit 1
fi

SKILL_MD="$(dirname "$(dirname "$(realpath "$EVAL_FILE")")")/SKILL.md"
if [[ ! -f "$SKILL_MD" ]]; then
  echo "ERROR: SKILL.md not found at $SKILL_MD" >&2; exit 1
fi

case_total=$(jq '.cases | length' "$EVAL_FILE")
passed=0
failed=0

echo "SKILL: ${SKILL_NAME}"
echo "Running behavior eval (${case_total} cases)"
echo "Note: requires 'claude --dangerously-skip-permissions' for file-write assertions"
echo

for i in $(seq 0 $((case_total - 1))); do
  case_id=$(jq -r ".cases[$i].id" "$EVAL_FILE")
  [[ -n "$CASE_FILTER" && "$case_id" != "$CASE_FILTER" ]] && continue

  prompt=$(jq -r ".cases[$i].prompt" "$EVAL_FILE")
  fixture_rel=$(jq -r ".cases[$i].fixture_workspace // empty" "$EVAL_FILE")
  echo "── case: $case_id ──"

  # Extract ticket ID (e.g. PROJ-1234) from prompt
  ticket_id=$(echo "$prompt" | grep -oE 'PROJ-[0-9]+' || true)

  # Clean up previous run artifacts for this ticket
  if [[ -n "$ticket_id" ]]; then
    feature_dir="${WORK_DIR}/${ticket_id}"
    [[ -d "$feature_dir" ]] && rm -rf "$feature_dir"
  fi

  # Resolve fixture workspace path and inject as REPO_ROOT override
  fixture_context=""
  if [[ -n "$fixture_rel" ]]; then
    fixture_name="${fixture_rel##fixtures/workspace/}"
    fixture_path="${FIXTURES_DIR}/${fixture_name}"
    if [[ -d "$fixture_path" ]]; then
      fixture_context="EVALUATION CONTEXT: The freight35 monorepo for this test is at ${fixture_path}. Treat that directory as REPO_ROOT instead of the OS default.
"
    else
      echo "  WARN: fixture not found at ${fixture_path} — CLAUDE.md hierarchy step may fall back to live grep"
    fi
  fi

  # Run the skill; --dangerously-skip-permissions allows Claude to write rationale files
  full_prompt="${fixture_context}${prompt}"
  output=$(claude --print \
    --dangerously-skip-permissions \
    --append-system-prompt "$(cat "$SKILL_MD")" \
    "$full_prompt" 2>&1 || true)

  case_passed=1

  # ── output text assertions ────────────────────────────────────────────────

  must_have=$(jq -r ".cases[$i].expected_outputs.must_contain_in_output[]? // empty" "$EVAL_FILE")
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    if ! echo "$output" | grep -qi "$s"; then
      echo "  ✗ output missing: \"$s\""
      case_passed=0
    fi
  done <<< "$must_have"

  must_not=$(jq -r ".cases[$i].expected_outputs.must_not_contain_in_output[]? // empty" "$EVAL_FILE")
  while IFS= read -r s; do
    [[ -z "$s" ]] && continue
    if echo "$output" | grep -qi "$s"; then
      echo "  ✗ output contains forbidden: \"$s\""
      case_passed=0
    fi
  done <<< "$must_not"

  # ── dependency-hop assertions (check output text) ─────────────────────────

  dep_terms=$(jq -r ".cases[$i].expected_outputs.dependency_hop_uses[]? // empty" "$EVAL_FILE")
  while IFS= read -r term; do
    [[ -z "$term" ]] && continue
    if ! echo "$output" | grep -qi "$term"; then
      echo "  ✗ output missing dependency-hop reference: \"$term\""
      case_passed=0
    fi
  done <<< "$dep_terms"

  # ── rationale warning / recommendation (check output or rationale file) ───

  warning=$(jq -r ".cases[$i].expected_outputs.rationale_must_contain_warning // empty" "$EVAL_FILE")
  if [[ -n "$warning" ]]; then
    found_warning=0
    echo "$output" | grep -qi "$warning" && found_warning=1
    if [[ -n "$ticket_id" && -f "${WORK_DIR}/${ticket_id}/discovery-rationale.md" ]]; then
      grep -qi "$warning" "${WORK_DIR}/${ticket_id}/discovery-rationale.md" && found_warning=1
    fi
    if [[ $found_warning -eq 0 ]]; then
      echo "  ✗ warning not found in output or rationale: \"$warning\""
      case_passed=0
    fi
  fi

  recommend=$(jq -r ".cases[$i].expected_outputs.rationale_should_recommend // empty" "$EVAL_FILE")
  if [[ -n "$recommend" ]]; then
    found_rec=0
    echo "$output" | grep -qi "$recommend" && found_rec=1
    if [[ -n "$ticket_id" && -f "${WORK_DIR}/${ticket_id}/discovery-rationale.md" ]]; then
      grep -qi "$recommend" "${WORK_DIR}/${ticket_id}/discovery-rationale.md" && found_rec=1
    fi
    if [[ $found_rec -eq 0 ]]; then
      echo "  ✗ recommendation not found: \"$recommend\""
      case_passed=0
    fi
  fi

  # ── file existence assertions (absolute paths; expand ~) ─────────────────

  files_must=$(jq -r ".cases[$i].expected_outputs.files_must_exist[]? // empty" "$EVAL_FILE")
  while IFS= read -r fpath; do
    [[ -z "$fpath" ]] && continue
    expanded="${fpath/\~/$HOME}"
    if [[ ! -f "$expanded" ]]; then
      echo "  ✗ expected file not found: $expanded"
      case_passed=0
    fi
  done <<< "$files_must"

  files_not=$(jq -r ".cases[$i].expected_outputs.files_must_not_exist[]? // empty" "$EVAL_FILE")
  while IFS= read -r fpath; do
    [[ -z "$fpath" ]] && continue
    expanded="${fpath/\~/$HOME}"
    if [[ -f "$expanded" ]]; then
      echo "  ✗ file should not exist: $expanded"
      case_passed=0
    fi
  done <<< "$files_not"

  # ── state_must_contain — read feature-state.json ─────────────────────────

  state_check=$(jq -c ".cases[$i].expected_outputs.state_must_contain // null" "$EVAL_FILE")
  if [[ "$state_check" != "null" && -n "$ticket_id" ]]; then
    state_file="${WORK_DIR}/${ticket_id}/feature-state.json"
    if [[ -f "$state_file" ]]; then
      while IFS=$'\t' read -r key val; do
        actual=$(jq -r ".${key} // \"__missing__\"" "$state_file" 2>/dev/null || echo "__missing__")
        if [[ "$actual" != "$val" ]]; then
          echo "  ✗ feature-state.json: $key expected \"$val\", got \"$actual\""
          case_passed=0
        fi
      done < <(echo "$state_check" | jq -r 'to_entries[] | [.key, (.value | tostring)] | @tsv')
    else
      echo "  ✗ feature-state.json not found: $state_file"
      case_passed=0
    fi
  fi

  # ── rationale_must_contain_sections ──────────────────────────────────────

  sections=$(jq -r ".cases[$i].expected_outputs.rationale_must_contain_sections[]? // empty" "$EVAL_FILE")
  if [[ -n "$sections" && -n "$ticket_id" ]]; then
    rationale="${WORK_DIR}/${ticket_id}/discovery-rationale.md"
    if [[ -f "$rationale" ]]; then
      while IFS= read -r section; do
        [[ -z "$section" ]] && continue
        if ! grep -q "$section" "$rationale"; then
          echo "  ✗ rationale missing section: $section"
          case_passed=0
        fi
      done <<< "$sections"
    else
      # Fallback: check stdout when file write is unavailable
      while IFS= read -r section; do
        [[ -z "$section" ]] && continue
        if ! echo "$output" | grep -qi "$section"; then
          echo "  ✗ rationale section not in output: $section"
          case_passed=0
        fi
      done <<< "$sections"
    fi
  fi

  # ── evidence_must_cite_both ───────────────────────────────────────────────

  evidence_terms=$(jq -r ".cases[$i].expected_outputs.evidence_must_cite_both[]? // empty" "$EVAL_FILE")
  if [[ -n "$evidence_terms" && -n "$ticket_id" ]]; then
    rationale="${WORK_DIR}/${ticket_id}/discovery-rationale.md"
    src="$output"
    [[ -f "$rationale" ]] && src="$(cat "$rationale")"
    while IFS= read -r term; do
      [[ -z "$term" ]] && continue
      if ! echo "$src" | grep -q "$term"; then
        echo "  ✗ evidence missing: \"$term\""
        case_passed=0
      fi
    done <<< "$evidence_terms"
  fi

  # ── services_must_include_definitely ─────────────────────────────────────

  svc_def=$(jq -r ".cases[$i].expected_outputs.services_must_include_definitely[]? // empty" "$EVAL_FILE")
  if [[ -n "$svc_def" && -n "$ticket_id" ]]; then
    rationale="${WORK_DIR}/${ticket_id}/discovery-rationale.md"
    src="$output"
    [[ -f "$rationale" ]] && src="$(cat "$rationale")"
    while IFS= read -r svc; do
      [[ -z "$svc" ]] && continue
      if ! echo "$src" | grep -A30 -i "Definitely" | grep -qi "$svc"; then
        echo "  ✗ 'Definitely' section missing service: $svc"
        case_passed=0
      fi
    done <<< "$svc_def"
  fi

  # ── services_must_include_likely ─────────────────────────────────────────

  svc_likely=$(jq -r ".cases[$i].expected_outputs.services_must_include_likely[]? // empty" "$EVAL_FILE")
  if [[ -n "$svc_likely" && -n "$ticket_id" ]]; then
    rationale="${WORK_DIR}/${ticket_id}/discovery-rationale.md"
    src="$output"
    [[ -f "$rationale" ]] && src="$(cat "$rationale")"
    while IFS= read -r svc; do
      [[ -z "$svc" ]] && continue
      if ! echo "$src" | grep -A20 -i "Likely" | grep -qi "$svc"; then
        echo "  ✗ 'Likely' section missing service: $svc"
        case_passed=0
      fi
    done <<< "$svc_likely"
  fi

  # ── result ────────────────────────────────────────────────────────────────

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
