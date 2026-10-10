#!/bin/bash
# AgentOffice launcher — (re)starts the Colyseus game server (:3000),
# the built UI (:5173), and fresh Cloudflare quick tunnels for both.
# Env knobs (export before running):
#   OPENROUTER_API_KEY  - agent brains (OpenRouter). If unset, agents render
#                         but cannot think until the key is set + restarted.
#   OPENROUTER_MODEL    - default: openai/gpt-4o-mini
#   THINK_INTERVAL_MS   - default: 60000 (60s between think calls per agent)
set -u
DIR="$HOME/workspace/agent-office"
LOGDIR="$DIR/logs"
mkdir -p "$LOGDIR"

echo "[start] stopping previous instances..."
pkill -f "packages/server/dist/index.js" 2>/dev/null
pkill -f "vite preview --port 5173" 2>/dev/null
pkill -f "cloudflared tunnel --url" 2>/dev/null
sleep 2

echo "[start] launching game server on :3000 ..."
cd "$DIR"
setsid nohup node packages/server/dist/index.js >> "$LOGDIR/server.log" 2>&1 < /dev/null &
echo $! > "$LOGDIR/server.pid"

echo "[start] launching UI on :5173 ..."
cd "$DIR/packages/ui"
setsid nohup "$DIR/node_modules/.bin/vite" preview --port 5173 --host 127.0.0.1 --strictPort >> "$LOGDIR/ui.log" 2>&1 < /dev/null &
echo $! > "$LOGDIR/ui.pid"
cd "$DIR"

sleep 4

echo "[start] services up: server=:3000 ui=:3000 (see $LOGDIR/)"
echo "[start] NOTE: public tunnels are established by watchdog.sh (run it now,"
echo "[start] or put it on a cron every 5 min — the egress proxy password rotates,"
echo "[start] so only a fresh process can re-authenticate the tunnel bridges)."
echo "[start] done."
