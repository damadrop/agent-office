#!/bin/bash
# watchdog.sh — keeps the AgentOffice public tunnels alive.
# The egress proxy password rotates per process invocation, so long-lived
# tunnel bridges cannot re-authenticate after a drop. This script (run from a
# fresh process, e.g. a cron job every 5 minutes) checks the public URLs and,
# if either is down, re-registers the localtunnel subdomains and restarts the
# bridges with fresh credentials.
set -u
DIR="$HOME/workspace/agent-office"
LOGDIR="$DIR/logs"
UI_SUB="jacob-office-ui2"
SRV_SUB="jacob-office-srv2"
UI_LOCAL_PORT=5173
SRV_LOCAL_PORT=3000

log() { echo "[watchdog $(date -u +%H:%M:%S)] $*"; }

check_url() { # $1 = url, $2 = must_contain
    local body
    body=$(curl -s --max-time 15 "$1" 2>/dev/null | head -c 300)
    [[ "$body" == *"$2"* ]]
}

ui_ok=0; srv_ok=0
check_url "https://${UI_SUB}.loca.lt/" "<!doctype html" && ui_ok=1
check_url "https://${SRV_SUB}.loca.lt/api/offices" '"status":"ok"' && srv_ok=1

if [[ $ui_ok -eq 1 && $srv_ok -eq 1 ]]; then
    log "tunnels healthy"
    exit 0
fi
log "tunnel down (ui_ok=$ui_ok srv_ok=$srv_ok) — recovering..."

# 1. Kill old bridges
pkill -f "[l]t-bridge.py" 2>/dev/null
sleep 2

# 2. Re-register subdomains (fresh ports; registrations can expire)
ui_json=$(curl -s --max-time 20 "https://localtunnel.me/${UI_SUB}")
srv_json=$(curl -s --max-time 20 "https://localtunnel.me/${SRV_SUB}")
ui_port=$(echo "$ui_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['port'])")
srv_port=$(echo "$srv_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['port'])")
log "ports: ui=$ui_port srv=$srv_port"

# 3. Restart bridges (this process has fresh proxy credentials)
B="$DIR/bin/lt-bridge.py"
setsid nohup python3 "$B" $UI_LOCAL_PORT localtunnel.me "$ui_port" >> "$LOGDIR/tunnel-ui.log" 2>&1 < /dev/null &
setsid nohup python3 "$B" $UI_LOCAL_PORT localtunnel.me "$ui_port" >> "$LOGDIR/tunnel-ui.log" 2>&1 < /dev/null &
setsid nohup python3 "$B" $SRV_LOCAL_PORT localtunnel.me "$srv_port" >> "$LOGDIR/tunnel-server.log" 2>&1 < /dev/null &
setsid nohup python3 "$B" $SRV_LOCAL_PORT localtunnel.me "$srv_port" >> "$LOGDIR/tunnel-server.log" 2>&1 < /dev/null &
sleep 10

# 4. Verify
ui_ok=0; srv_ok=0
check_url "https://${UI_SUB}.loca.lt/" "<!doctype html" && ui_ok=1
check_url "https://${SRV_SUB}.loca.lt/api/offices" '"status":"ok"' && srv_ok=1
if [[ $ui_ok -eq 1 && $srv_ok -eq 1 ]]; then
    log "recovery OK — https://${UI_SUB}.loca.lt/ (ws via ?ws=wss://${SRV_SUB}.loca.lt)"
    exit 0
else
    log "recovery FAILED (ui_ok=$ui_ok srv_ok=$srv_ok)"
    exit 1
fi
