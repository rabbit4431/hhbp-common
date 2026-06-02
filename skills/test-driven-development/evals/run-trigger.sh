#!/usr/bin/env bash
# Trigger eval runner — shared harness for all springboot-feature skills.
# Tests whether the named skill fires on the right prompts and stays silent on the wrong ones.
#
# Detection method: meta-classification.  For each prompt, Claude is asked whether it would
# invoke the skill given its description.  This directly tests what trigger evals measure —
# "is the description specific enough to attract the right prompts?" — without requiring a
# real skill-loading mechanism in the CLI.
#
# Usage:
#   ./run-trigger.sh [--eval <path>] [--skill <name>] [--verbose]
#
# Defaults (when run directly for the TDD skill):
#   --eval  ./trigger-eval.json
#   --skill test-driven-development
#
# Other skills delegate here, passing their own --eval and --skill values.
#
# Requires: claude CLI in PATH, jq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_FILE="${SCRIPT_DIR}/trigger-eval.json"
SKILL_NAME="test-driven-development"
VERBOSE=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval)    EVAL_FILE="$2"; shift 2 ;;
    --skill)   SKILL_NAME="$2"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI not found in PATH" >&2
  exit 1
fi

# Derive SKILL.md location from the eval file path:
#   skills/<name>/evals/trigger-eval.json  →  skills/<name>/SKILL.md
SKILL_MD="$(dirname "$(dirname "$(realpath "$EVAL_FILE")")")/SKILL.md"

if [[ ! -f "$SKILL_MD" ]]; then
  echo "ERROR: SKILL.md not found at $SKILL_MD" >&2
  exit 1
fi

# Extract the description: line from SKILL.md frontmatter (between the --- delimiters).
SKILL_DESC=$(awk '
  /^---$/ { delim++; next }
  delim == 1 && /^description:/ { sub(/^description:[[:space:]]*/, ""); print; exit }
' "$SKILL_MD")

if [[ -z "$SKILL_DESC" ]]; then
  echo "ERROR: could not extract description from $SKILL_MD" >&2
  exit 1
fi

echo "SKILL: ${SKILL_NAME}"
echo "Running trigger eval from: ${EVAL_FILE}"
[[ $VERBOSE -eq 1 ]] && echo "Description: ${SKILL_DESC}"
echo

pos_total=$(jq '.positive_cases | length' "$EVAL_FILE")
neg_total=$(jq '.negative_cases | length' "$EVAL_FILE")

pos_triggered=0
neg_correctly_silent=0

# Ask Claude whether it would invoke this skill for a given prompt.
# This is a classification call, not a skill-execution call — no special CLI flags needed.
skill_fired() {
  local prompt="$1"
  local meta_prompt
  meta_prompt="You are a routing system that selects which skill to invoke.

Skill name: ${SKILL_NAME}
Skill description: ${SKILL_DESC}

User prompt: \"${prompt}\"

Based solely on the skill description above, would you invoke this skill to handle the user prompt? Reply with exactly one word: yes or no."

  local answer
  answer=$(claude --print "$meta_prompt" 2>&1 || true)

  echo "$answer" | grep -qi "^yes" && return 0
  return 1
}

echo "POSITIVE CASES (${pos_total}):"
for i in $(seq 0 $((pos_total - 1))); do
  prompt=$(jq -r ".positive_cases[$i].prompt" "$EVAL_FILE")
  label=$(jq -r ".positive_cases[$i].id // .positive_cases[$i].tags[0] // \"case-$i\"" "$EVAL_FILE")

  if skill_fired "$prompt"; then
    echo "  ✓ ${label}  [triggered]"
    pos_triggered=$((pos_triggered + 1))
  else
    echo "  ✗ ${label}  [NOT triggered]"
    [[ $VERBOSE -eq 1 ]] && echo "    prompt: $prompt"
  fi
done

echo
echo "NEGATIVE CASES (${neg_total}):"
for i in $(seq 0 $((neg_total - 1))); do
  prompt=$(jq -r ".negative_cases[$i].prompt" "$EVAL_FILE")
  label=$(jq -r ".negative_cases[$i].id // \"case-$i\"" "$EVAL_FILE")
  reason=$(jq -r ".negative_cases[$i].reason_for_excluding // \"\"" "$EVAL_FILE")
  should_trigger=$(jq -r ".negative_cases[$i].should_trigger // false" "$EVAL_FILE")

  triggered=0
  skill_fired "$prompt" && triggered=1

  if [[ "$should_trigger" == "true" ]]; then
    if [[ $triggered -eq 1 ]]; then
      echo "  ✓ ${label}  [triggered as expected — verify it refuses]"
      neg_correctly_silent=$((neg_correctly_silent + 1))
    else
      echo "  ✗ ${label}  [did NOT trigger — should have]"
      [[ $VERBOSE -eq 1 ]] && echo "    prompt: $prompt"
    fi
  else
    if [[ $triggered -eq 0 ]]; then
      echo "  ✓ ${label}  [correctly did not trigger]"
      neg_correctly_silent=$((neg_correctly_silent + 1))
    else
      echo "  ✗ ${label}  [falsely triggered]"
      [[ $VERBOSE -eq 1 ]] && echo "    reason this should not trigger: $reason"
    fi
  fi
done

echo
echo "Trigger rate (positives): ${pos_triggered}/${pos_total} = $((pos_triggered * 100 / pos_total))%"
echo "Correct negative rate:    ${neg_correctly_silent}/${neg_total} = $((neg_correctly_silent * 100 / neg_total))%"

if [[ $pos_triggered -lt $((pos_total * 90 / 100)) ]]; then
  echo "WARN: trigger rate below 90% threshold — edit SKILL.md description"
  exit 1
fi
