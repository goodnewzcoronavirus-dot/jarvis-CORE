# Start jarvis-core on Windows. -Remote also exposes it privately over Tailscale.
param([switch]$Remote)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$Port = if ($env:JARVIS_PORT) { $env:JARVIS_PORT } else { "8000" }

if ($Remote) {
  if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    Write-Host "Tailscale isn't installed. See README, section 'Use it from your phone'."; exit 1
  }
  # Private to your tailnet only. Never use `tailscale funnel` for this app.
  tailscale serve --bg $Port
  tailscale serve status
}

Write-Host "==> Local URL: http://localhost:$Port"
uv run jarvis serve --host 127.0.0.1 --port $Port
