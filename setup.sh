#!/usr/bin/env bash
# jarvis-core setup (macOS / Linux / WSL2). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

MODEL="${JARVIS_MODEL:-qwen3.5:2b}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing: $1"
    echo "  Install it: $2"
    exit 1
  fi
}

need uv     "curl -LsSf https://astral.sh/uv/install.sh | sh"
need node   "https://nodejs.org (version 22.22 or newer)"
need ollama "https://ollama.com/download"

NODE_MAJOR_MINOR=$(node -p 'process.versions.node.split(".").slice(0,2).join(".")')
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=22)?0:1)'; then
  echo "Node $NODE_MAJOR_MINOR is too old. Install Node 22.22 or newer."
  exit 1
fi

echo "==> Installing Python backend"
uv sync --extra server --extra inference-cloud

echo "==> Building native extension (memory + search over your data, ~5 min first time)"
if command -v cargo >/dev/null 2>&1; then
  uv run --with "maturin>=1.12.6" maturin develop --release \
    -m rust/crates/openjarvis-python/Cargo.toml
else
  echo "    Rust not found, skipping. Chat works, but searching connected data won't."
  echo "    Install Rust (https://rustup.rs) and re-run ./setup.sh to enable it."
fi

echo "==> Building web UI"
(
  cd frontend
  # The frontend pins npm 11; run it via npx so your global npm is untouched.
  npx -y npm@11 ci
  npx -y npm@11 run build
)

echo "==> Writing config (if you don't have one yet)"
if [ ! -f "$HOME/.openjarvis/config.toml" ]; then
  uv run jarvis _bootstrap --write-config --engine ollama --model "$MODEL"
else
  echo "    ~/.openjarvis/config.toml already exists, leaving it alone"
fi

echo "==> Pulling local model $MODEL"
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  (ollama serve >/dev/null 2>&1 &)
  sleep 3
fi
ollama pull "$MODEL"

echo
echo "Done. Start it with:  ./start.sh"
echo "Reach it from your phone too:  ./start.sh --remote   (needs Tailscale, see README)"
