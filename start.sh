#!/usr/bin/env bash
# Start jarvis-core. Use --remote to also expose it privately over Tailscale.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${JARVIS_PORT:-8000}"
REMOTE=0
[ "${1:-}" = "--remote" ] && REMOTE=1

# Make sure Ollama is running for local models.
if command -v ollama >/dev/null 2>&1 && ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "==> Starting Ollama"
  (ollama serve >/dev/null 2>&1 &)
  sleep 3
fi

if [ "$REMOTE" = 1 ]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale isn't installed. See README, section 'Use it from your phone'."
    exit 1
  fi
  # Private to devices signed in to YOUR tailnet. Never use `tailscale funnel`
  # here: that would put your inbox on the public internet.
  tailscale serve --bg "$PORT"
  echo "==> Remote URL (works on any device signed in to your Tailscale):"
  tailscale serve status | grep -Eo 'https://[^ ]+' | head -1 || true
fi

echo "==> Local URL: http://localhost:$PORT"
# Bound to localhost only. Tailscale forwards to it; nothing else can reach it.
exec uv run jarvis serve --host 127.0.0.1 --port "$PORT"
