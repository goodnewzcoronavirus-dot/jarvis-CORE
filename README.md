# jarvis-core

A stripped-down base of [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) (Stanford Hazy Research + Scaling Intelligence Lab, Apache 2.0). It's the starting point for a personal task and goal copilot.

What's kept:
- **Chat** with local models through Ollama, plus optional cloud models (add an API key in Settings)
- **Data Sources**: Gmail, Google Calendar, Google Tasks, Outlook mail (IMAP), Notion, Slack, Obsidian, and more
- **Settings**

What's removed from the UI: the savings dashboard, the agents, logs and get-started pages, the system and cost panel, the "Win a Mac mini" leaderboard popup, and all external analytics (hard-disabled in the frontend and backend). The backend code for agents and the scheduler is still in `src/`, so it can come back later.

## Run it on your computer

Install these first:
- [uv](https://docs.astral.sh/uv/)
- [Node.js](https://nodejs.org) 22.22 or newer
- [Ollama](https://ollama.com/download)
- [Rust](https://rustup.rs) (for memory and search over your connected data; the first build takes about 5 minutes)

Then run:

```bash
git clone <this repo>
cd jarvis-core
./setup.sh        # Windows: .\setup.ps1
./start.sh        # Windows: .\start.ps1
```

Open http://localhost:8000.

`setup.sh` pulls a small local model (`qwen3.5:2b`). To use a different one, set it first, e.g. `JARVIS_MODEL=qwen3.5:9b ./setup.sh`, or switch models from the model picker in the top left.

## Use it from your phone (or any device)

This uses [Tailscale](https://tailscale.com/download), a free private network for your own devices. Only devices signed in to your Tailscale account can open the app. It is never on the public internet.

1. Install Tailscale on your computer and your phone, and sign in on both with the same account.
2. Run `./start.sh --remote` (Windows: `.\start.ps1 -Remote`).
3. It prints a link like `https://your-laptop.tailXXXX.ts.net`. Open that link on your phone.

The computer has to be on and running `start.sh` for this to work. Don't use `tailscale funnel` with this app: Funnel makes it public, and your inbox would be readable by anyone.

## Connect accounts

Go to **Data Sources → + Add**. Google is one sign-in for Gmail, Calendar and Tasks. Outlook mail uses an app password, which some school or work accounts block. There's no Outlook calendar or OneDrive connector yet.

## Where things live

| Path | What |
|---|---|
| `frontend/src/pages/` | UI pages (Chat, Data Sources, Settings). New pages go here. |
| `frontend/src/components/Sidebar/Sidebar.tsx` | Sidebar nav items |
| `frontend/src/App.tsx` | Routes |
| `src/openjarvis/connectors/` | Data source connectors |
| `src/openjarvis/server/` | API server that also serves the built UI |
| `~/.openjarvis/config.toml` | Your local config (model, engine) |

After editing the frontend, rebuild with `cd frontend && npx npm@11 run build`, then restart. The original upstream README is in `docs/UPSTREAM_README.md`.
