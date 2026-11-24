# jarvis-core setup (Windows PowerShell). Safe to re-run.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Model = if ($env:JARVIS_MODEL) { $env:JARVIS_MODEL } else { "qwen3.5:2b" }

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Missing: $cmd`n  Install it: $hint"; exit 1
  }
}
Need uv     "powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`""
Need node   "https://nodejs.org (version 22.22 or newer)"
Need ollama "https://ollama.com/download"

Write-Host "==> Installing Python backend"
uv sync --extra server --extra inference-cloud

Write-Host "==> Building native extension (memory + search over your data, ~5 min first time)"
if (Get-Command cargo -ErrorAction SilentlyContinue) {
  uv run --with "maturin>=1.12.6" maturin develop --release -m rust/crates/openjarvis-python/Cargo.toml
} else {
  Write-Host "    Rust not found, skipping. Install it from https://rustup.rs and re-run to enable data search."
}

Write-Host "==> Building web UI"
Push-Location frontend
npx -y npm@11 ci
npx -y npm@11 run build
Pop-Location

Write-Host "==> Writing config (if you don't have one yet)"
if (-not (Test-Path "$HOME\.openjarvis\config.toml")) {
  uv run jarvis _bootstrap --write-config --engine ollama --model $Model
}

Write-Host "==> Pulling local model $Model"
ollama pull $Model

Write-Host "`nDone. Start it with:  .\start.ps1   (add -Remote for Tailscale access)"
