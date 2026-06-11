#!/usr/bin/env bash
# categorize-results.sh
# Splits services into definitely/likely/possibly buckets from agentic-search results.
#
# Usage: ./categorize-results.sh <direct-matches-file> <dep-walk-matches-file>
#
# Reads two files of service names (one per line):
#   - direct-matches: services confirmed by CLAUDE.md routing + live grep (Steps 2-3)
#                     i.e. they own or consume an identifier from the ticket
#   - dep-walk-matches: services found via the dependency hop — L2 "Talks to" + Nacos (Step 4)
#
# Outputs a JSON categorization:
#   - definitely: in direct-matches AND owns the changed behavior
#   - likely: in direct-matches via endpoint/topic (consumes a changed contract) — placed manually
#   - possibly: only in dep-walk-matches (adjacent, needs human judgment)

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <direct-matches-file> <dep-walk-matches-file>" >&2
  exit 1
fi

DIRECT="$1"
DEP_WALK="$2"

definitely=$(sort -u "$DIRECT" | head -10 | tr '\n' ',' | sed 's/,$//')
possibly=$(comm -23 <(sort -u "$DEP_WALK") <(sort -u "$DIRECT") | tr '\n' ',' | sed 's/,$//')

jq -n \
  --arg definitely "$definitely" \
  --arg possibly "$possibly" \
  '{
    definitely: ($definitely | split(",") | map(select(. != ""))),
    likely: [],
    possibly: ($possibly | split(",") | map(select(. != "")))
  }'

echo
echo "NOTE: 'likely' bucket needs manual placement —"
echo "services in 'direct' that consume (not own) the changed contracts."
echo "Inspect the search hits and move them from 'definitely' to 'likely' as appropriate."
