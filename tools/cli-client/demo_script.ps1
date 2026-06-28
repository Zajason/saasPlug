# =============================================================================
# CONFIGURATION VARIABLES
# =============================================================================
$CLI_EXEC = "node"
$CLI_SCRIPT = "se2502.js"

$USER_EMAIL = "admin@ev.local"
$PASS = "admin123"
$POINTS_FILE = "points_test.csv"

# Time Variables
$S1 = "2025-01-01 10:00"
$E1 = "2025-01-01 11:00"
$S2 = "2025-01-01 12:00"
$E2 = "2025-01-01 13:00"

$DATE_FROM = "20250101"
$DATE_TO = "20250102"

# Initialize empty ID
$POINT_ID = "" 

function Pause-Script {
    Write-Host ""
    Read-Host "Press [Enter] to continue to the next step..."
    Write-Host "------------------------------------------------------------------"
    Write-Host ""
}

Write-Host "=================================================================="
Write-Host "STARTING CHARGENET PRESENTATION DEMO (REGEX METHOD)"
Write-Host "=================================================================="

# -----------------------------------------------------------------------------
# STEP 0: LOGIN
# -----------------------------------------------------------------------------
Write-Host "[STEP 0] Logging in as $USER_EMAIL..."
& $CLI_EXEC $CLI_SCRIPT login --username "$USER_EMAIL" --passw "$PASS"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 0.5: ADD PAYMENT METHOD
# -----------------------------------------------------------------------------
Write-Host "[STEP 0.5] Adding a default mock payment method..."
& $CLI_EXEC $CLI_SCRIPT addcard
Pause-Script

# -----------------------------------------------------------------------------
# STEP 1: HEALTHCHECK
# -----------------------------------------------------------------------------
Write-Host "[STEP 1] Healthcheck..."
& $CLI_EXEC $CLI_SCRIPT healthcheck
Pause-Script

# -----------------------------------------------------------------------------
# STEP 2: RESET POINTS
# -----------------------------------------------------------------------------
Write-Host "[STEP 2] Resetting all points..."
& $CLI_EXEC $CLI_SCRIPT resetpoints
Pause-Script

# -----------------------------------------------------------------------------
# STEP 3: ADD POINTS
# -----------------------------------------------------------------------------
Write-Host "[STEP 3] Adding points from $POINTS_FILE..."
& $CLI_EXEC $CLI_SCRIPT addpoints --source "$POINTS_FILE"
Pause-Script

# =============================================================================
# DYNAMIC ID FETCHING (REGEX - ROBUST)
# =============================================================================
Write-Host "[SYSTEM] Fetching a valid Point ID dynamically..." -ForegroundColor Cyan

# 1. Capture the raw output as a single string (merging all lines)
$rawOutput = & $CLI_EXEC $CLI_SCRIPT points --status available --format json | Out-String

# 2. Use Regex to find the FIRST occurrence of "pointid": <number>
# Pattern explanation: matches "pointid" followed by colon, optional space, optional quote, the number, optional quote
if ($rawOutput -match '"pointid"\s*:\s*"?(\d+)"?') {
    # $matches[1] contains the captured number
    $POINT_ID = $matches[1]
    Write-Host "--> Success! We will use Point ID: $POINT_ID" -ForegroundColor Green
} else {
    Write-Error "CRITICAL: Could not extract a Point ID. CLI Output might be empty."
    Write-Host "DEBUG RAW OUTPUT START:" -ForegroundColor Gray
    Write-Host $rawOutput
    Write-Host "DEBUG RAW OUTPUT END" -ForegroundColor Gray
    exit 1
}
Write-Host ""
# =============================================================================


# -----------------------------------------------------------------------------
# STEP 4: HEALTHCHECK
# -----------------------------------------------------------------------------
Write-Host "[STEP 4] Healthcheck: Verifying import..."
& $CLI_EXEC $CLI_SCRIPT healthcheck
Pause-Script

# -----------------------------------------------------------------------------
# STEP 5: STATUS AVAILABLE
# -----------------------------------------------------------------------------
Write-Host "[STEP 5] Viewing points with status 'available'..."
& $CLI_EXEC $CLI_SCRIPT points --status available
Pause-Script

# -----------------------------------------------------------------------------
# STEP 6: STATUS CHARGING
# -----------------------------------------------------------------------------
Write-Host "[STEP 6] Viewing points with status 'charging'..."
& $CLI_EXEC $CLI_SCRIPT points --status charging
Pause-Script

# -----------------------------------------------------------------------------
# STEP 7: STATUS OUT OF ORDER
# -----------------------------------------------------------------------------
# Fixed: Using 'outoforder' instead of 'offline' to avoid 400 error
Write-Host "[STEP 7] Viewing points with status 'outoforder'..."
& $CLI_EXEC $CLI_SCRIPT points --status outoforder
Pause-Script

# -----------------------------------------------------------------------------
# STEP 8: POINT INFO
# -----------------------------------------------------------------------------
Write-Host "[STEP 8] Details for Point ID: $POINT_ID..."
& $CLI_EXEC $CLI_SCRIPT point --id "$POINT_ID"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 9: RESERVE
# -----------------------------------------------------------------------------
Write-Host "[STEP 9] Reserving Point ID: $POINT_ID..."
& $CLI_EXEC $CLI_SCRIPT reserve --id "$POINT_ID" --minutes 30
Pause-Script

# -----------------------------------------------------------------------------
# STEP 10: STATUS RESERVED
# -----------------------------------------------------------------------------
Write-Host "[STEP 10] Viewing points with status 'reserved'..."
& $CLI_EXEC $CLI_SCRIPT points --status reserved
Pause-Script

# -----------------------------------------------------------------------------
# STEP 11: POINT INFO
# -----------------------------------------------------------------------------
Write-Host "[STEP 11] Details for Point ID: $POINT_ID (Verify Reservation)..."
& $CLI_EXEC $CLI_SCRIPT point --id "$POINT_ID"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 12: UPDATE POINT (Release)
# -----------------------------------------------------------------------------
Write-Host "[STEP 12] Releasing Point ID: $POINT_ID (Setting to available)..."
& $CLI_EXEC $CLI_SCRIPT updpoint --id "$POINT_ID" --status available
Pause-Script

# -----------------------------------------------------------------------------
# STEP 13: POINT INFO
# -----------------------------------------------------------------------------
Write-Host "[STEP 13] Details for Point ID: $POINT_ID (Verify Release)..."
& $CLI_EXEC $CLI_SCRIPT point --id "$POINT_ID"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 14: RESERVE AGAIN
# -----------------------------------------------------------------------------
Write-Host "[STEP 14] Reserving Point ID: $POINT_ID again..."
& $CLI_EXEC $CLI_SCRIPT reserve --id "$POINT_ID" --minutes 30
Pause-Script

# -----------------------------------------------------------------------------
# STEP 15: CHECK RESERVED
# -----------------------------------------------------------------------------
Write-Host "[STEP 15] Checking reserved points..."
& $CLI_EXEC $CLI_SCRIPT points --status reserved
Pause-Script

# -----------------------------------------------------------------------------
# STEP 16: NEW SESSION 1
# -----------------------------------------------------------------------------
Write-Host "[STEP 16] Recording Session 1 ($S1 to $E1)..."
& $CLI_EXEC $CLI_SCRIPT newsession --id "$POINT_ID" `
  --starttime "$S1" --endtime "$E1" `
  --startsoc 10 --endsoc 30 `
  --totalkwh 15 --kwhprice 0.5 --amount 7.5
Pause-Script

# -----------------------------------------------------------------------------
# STEP 17: POINT STATUS HISTORY
# -----------------------------------------------------------------------------
Write-Host "[STEP 17] History of Point ID: $POINT_ID..."
& $CLI_EXEC $CLI_SCRIPT pointstatus --id "$POINT_ID" --from "$DATE_FROM" --to "$DATE_TO"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 18: POINT INFO
# -----------------------------------------------------------------------------
Write-Host "[STEP 18] Details for Point ID: $POINT_ID..."
& $CLI_EXEC $CLI_SCRIPT point --id "$POINT_ID"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 19: NEW SESSION 2
# -----------------------------------------------------------------------------
Write-Host "[STEP 19] Recording Session 2 ($S2 to $E2)..."
& $CLI_EXEC $CLI_SCRIPT newsession --id "$POINT_ID" `
  --starttime "$S2" --endtime "$E2" `
  --startsoc 50 --endsoc 80 `
  --totalkwh 20 --kwhprice 0.6 --amount 12
Pause-Script

# -----------------------------------------------------------------------------
# STEP 20: SESSIONS HISTORY
# -----------------------------------------------------------------------------
Write-Host "[STEP 20] Session History for Point ID: $POINT_ID..."
& $CLI_EXEC $CLI_SCRIPT sessions --id "$POINT_ID" --from "$DATE_FROM" --to "$DATE_TO"
Pause-Script

# -----------------------------------------------------------------------------
# STEP 21: POINT STATUS
# -----------------------------------------------------------------------------
Write-Host "[STEP 21] Final Status check for Point ID: $POINT_ID..."
& $CLI_EXEC $CLI_SCRIPT pointstatus --id "$POINT_ID" --from "$DATE_FROM" --to "$DATE_TO"

Write-Host ""
Write-Host "=================================================================="
Write-Host "DEMO COMPLETED SUCCESSFULLY"
Write-Host "=================================================================="