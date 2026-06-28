#!/bin/bash
set -euo pipefail

# =============================================================================
# CONFIGURATION VARIABLES
# =============================================================================
CLI_EXEC="node"
CLI_SCRIPT="se2502.js"

USER_EMAIL="admin@ev.local"
PASS="admin123"
POINTS_FILE="points_test.csv"

# Time Variables
S1="2025-01-01 10:00"
E1="2025-01-01 11:00"
S2="2025-01-01 12:00"
E2="2025-01-01 13:00"

DATE_FROM="20250101"
DATE_TO="20250102"

# Initialize empty ID
POINT_ID=""

# =============================================================================
# Helpers
# =============================================================================
pause_script() {
  echo ""
  read -r -p "Press [Enter] to continue to the next step..."
  echo "------------------------------------------------------------------"
  echo ""
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

# Run CLI and capture BOTH stdout + stderr (important when CLI prints debug on stderr)
run_cli() {
  # Usage: run_cli <args...>
  # Prints combined output
  "$CLI_EXEC" "$CLI_SCRIPT" "$@" 2>&1 || true
}

# Robust ID extraction:
# 1) Prefer python3 JSON parsing if available
# 2) fallback to sed regex that matches pointid/pointID/id with or without quotes
extract_point_id() {
  local raw="$1"
  local id=""

  # Try python3 JSON parse if available
  if command -v python3 >/dev/null 2>&1; then
    id="$(python3 - <<'PY' "$raw" || true
import json, sys, re

raw = sys.argv[1].strip()

# try to isolate the last JSON object/array if mixed output
m = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])\s*$', raw)
if m:
  raw_json = m.group(1)
else:
  raw_json = raw

try:
  data = json.loads(raw_json)
except Exception:
  print("")
  sys.exit(0)

def first_id(obj):
  if isinstance(obj, dict):
    for k in ("pointid","pointID","id","ID"):
      if k in obj and obj[k] is not None:
        return obj[k]
    # common nesting: {"points":[...]}
    for k in ("points","data","result","items"):
      if k in obj:
        return first_id(obj[k])
    return None
  if isinstance(obj, list) and obj:
    return first_id(obj[0])
  return None

val = first_id(data)
if val is None:
  print("")
elif isinstance(val, (int, float)):
  print(int(val))
else:
  s = str(val).strip()
  # keep digits if it looks numeric
  m = re.search(r'\d+', s)
  print(m.group(0) if m else s)
PY
)"
    if [ -n "$id" ]; then
      echo "$id"
      return 0
    fi
  fi

  # Fallback: sed-based extraction (macOS compatible)
  # Matches: "pointid": 123  OR  "pointID":"123"  OR  "id":123
  id="$(echo "$raw" | sed -nE 's/.*"?(pointid|pointID|id|ID)"?[[:space:]]*:[[:space:]]*"?([0-9]+)".*/\2/p' | head -n 1)"
  if [ -n "$id" ]; then
    echo "$id"
    return 0
  fi

  echo ""
  return 1
}

# =============================================================================
# Checks
# =============================================================================
require_cmd "$CLI_EXEC"
require_cmd sed
# python3 is optional (but recommended)

echo "=================================================================="
echo "STARTING CHARGENET PRESENTATION DEMO (ROBUST ID FETCH)"
echo "=================================================================="

# -----------------------------------------------------------------------------
# STEP 0: LOGIN
# -----------------------------------------------------------------------------
echo "[STEP 0] Logging in as $USER_EMAIL..."
run_cli login --username "$USER_EMAIL" --passw "$PASS"
pause_script

# -----------------------------------------------------------------------------
# STEP 0.5: ADD PAYMENT METHOD
# -----------------------------------------------------------------------------
echo "[STEP 0.5] Adding a default mock payment method..."
run_cli addcard
pause_script

# -----------------------------------------------------------------------------
# STEP 1: HEALTHCHECK
# -----------------------------------------------------------------------------
echo "[STEP 1] Healthcheck..."
run_cli healthcheck
pause_script

# -----------------------------------------------------------------------------
# STEP 2: RESET POINTS
# -----------------------------------------------------------------------------
echo "[STEP 2] Resetting all points..."
run_cli resetpoints
pause_script

# -----------------------------------------------------------------------------
# STEP 3: ADD POINTS
# -----------------------------------------------------------------------------
echo "[STEP 3] Adding points from $POINTS_FILE..."
run_cli addpoints --source "$POINTS_FILE"
pause_script

# =============================================================================
# DYNAMIC ID FETCHING (ROBUST)
# =============================================================================
echo -e "\033[0;36m[SYSTEM] Fetching a valid Point ID dynamically...\033[0m"

RAW_OUTPUT="$(run_cli points --status available --format json)"

POINT_ID="$(extract_point_id "$RAW_OUTPUT" || true)"

# If no available points, maybe the status values differ. Fallback: try without status filter.
if [ -z "$POINT_ID" ]; then
  RAW_OUTPUT_ALL="$(run_cli points --format json)"
  POINT_ID="$(extract_point_id "$RAW_OUTPUT_ALL" || true)"
  # Keep RAW_OUTPUT as the most useful debug if still failing
  RAW_OUTPUT="$RAW_OUTPUT_ALL"
fi

if [ -n "$POINT_ID" ]; then
  echo -e "\033[0;32m--> Success! We will use Point ID: $POINT_ID\033[0m"
else
  echo "CRITICAL: Could not extract a Point ID."
  echo ""
  echo "DEBUG RAW OUTPUT START:"
  echo "$RAW_OUTPUT"
  echo "DEBUG RAW OUTPUT END"
  exit 1
fi
echo ""
# =============================================================================

# -----------------------------------------------------------------------------
# STEP 4: HEALTHCHECK
# -----------------------------------------------------------------------------
echo "[STEP 4] Healthcheck: Verifying import..."
run_cli healthcheck
pause_script

# -----------------------------------------------------------------------------
# STEP 5: STATUS AVAILABLE
# -----------------------------------------------------------------------------
echo "[STEP 5] Viewing points with status 'available'..."
run_cli points --status available
pause_script

# -----------------------------------------------------------------------------
# STEP 6: STATUS CHARGING
# -----------------------------------------------------------------------------
echo "[STEP 6] Viewing points with status 'charging'..."
run_cli points --status charging
pause_script

# -----------------------------------------------------------------------------
# STEP 7: STATUS OUT OF ORDER
# -----------------------------------------------------------------------------
echo "[STEP 7] Viewing points with status 'outoforder'..."
run_cli points --status outoforder
pause_script

# -----------------------------------------------------------------------------
# STEP 8: POINT INFO
# -----------------------------------------------------------------------------
echo "[STEP 8] Details for Point ID: $POINT_ID..."
run_cli point --id "$POINT_ID"
pause_script

# -----------------------------------------------------------------------------
# STEP 9: RESERVE
# -----------------------------------------------------------------------------
echo "[STEP 9] Reserving Point ID: $POINT_ID..."
run_cli reserve --id "$POINT_ID" --minutes 30
pause_script

# -----------------------------------------------------------------------------
# STEP 10: STATUS RESERVED
# -----------------------------------------------------------------------------
echo "[STEP 10] Viewing points with status 'reserved'..."
run_cli points --status reserved
pause_script

# -----------------------------------------------------------------------------
# STEP 11: POINT INFO
# -----------------------------------------------------------------------------
echo "[STEP 11] Details for Point ID: $POINT_ID (Verify Reservation)..."
run_cli point --id "$POINT_ID"
pause_script

# -----------------------------------------------------------------------------
# STEP 12: UPDATE POINT (Release)
# -----------------------------------------------------------------------------
echo "[STEP 12] Releasing Point ID: $POINT_ID (Setting to available)..."
run_cli updpoint --id "$POINT_ID" --status available
pause_script

# -----------------------------------------------------------------------------
# STEP 13: POINT INFO
# -----------------------------------------------------------------------------
echo "[STEP 13] Details for Point ID: $POINT_ID (Verify Release)..."
run_cli point --id "$POINT_ID"
pause_script

# -----------------------------------------------------------------------------
# STEP 14: RESERVE AGAIN
# -----------------------------------------------------------------------------
echo "[STEP 14] Reserving Point ID: $POINT_ID again..."
run_cli reserve --id "$POINT_ID" --minutes 30
pause_script

# -----------------------------------------------------------------------------
# STEP 15: CHECK RESERVED
# -----------------------------------------------------------------------------
echo "[STEP 15] Checking reserved points..."
run_cli points --status reserved
pause_script

# -----------------------------------------------------------------------------
# STEP 16: NEW SESSION 1
# -----------------------------------------------------------------------------
echo "[STEP 16] Recording Session 1 ($S1 to $E1)..."
run_cli newsession --id "$POINT_ID" \
  --starttime "$S1" --endtime "$E1" \
  --startsoc 10 --endsoc 30 \
  --totalkwh 15 --kwhprice 0.5 --amount 7.5
pause_script

# -----------------------------------------------------------------------------
# STEP 17: POINT STATUS HISTORY
# -----------------------------------------------------------------------------
echo "[STEP 17] History of Point ID: $POINT_ID..."
run_cli pointstatus --id "$POINT_ID" --from "$DATE_FROM" --to "$DATE_TO"
pause_script

# -----------------------------------------------------------------------------
# STEP 18: POINT INFO
# -----------------------------------------------------------------------------
echo "[STEP 18] Details for Point ID: $POINT_ID..."
run_cli point --id "$POINT_ID"
pause_script

# -----------------------------------------------------------------------------
# STEP 19: NEW SESSION 2
# -----------------------------------------------------------------------------
echo "[STEP 19] Recording Session 2 ($S2 to $E2)..."
run_cli newsession --id "$POINT_ID" \
  --starttime "$S2" --endtime "$E2" \
  --startsoc 50 --endsoc 80 \
  --totalkwh 20 --kwhprice 0.6 --amount 12
pause_script

# -----------------------------------------------------------------------------
# STEP 20: SESSIONS HISTORY
# -----------------------------------------------------------------------------
echo "[STEP 20] Session History for Point ID: $POINT_ID..."
run_cli sessions --id "$POINT_ID" --from "$DATE_FROM" --to "$DATE_TO"
pause_script

# -----------------------------------------------------------------------------
# STEP 21: POINT STATUS
# -----------------------------------------------------------------------------
echo "[STEP 21] Final Status check for Point ID: $POINT_ID..."
run_cli pointstatus --id "$POINT_ID" --from "$DATE_FROM" --to "$DATE_TO"

echo ""
echo "=================================================================="
echo "DEMO COMPLETED SUCCESSFULLY"
echo "=================================================================="
