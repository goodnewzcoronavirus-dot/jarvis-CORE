# Jarvis

A personal productivity copilot that runs entirely in your browser. There's no server and nothing to install.

**Live app:** https://goodnewzcoronavirus-dot.github.io/jarvis-CORE/

## What it does now

**Plan** (the organizing side)
- **Buckets > Goals > Milestones > Tasks.** Goals have a target date and a "why". Tasks can also sit directly in a bucket.
- **Jarvis schedules for you.** Every open task gets a do-date: earliest deadline first, inherited from its milestone or goal, with a daily limit (default 4/day). Steps inside a goal or milestone keep the order you added them. Set a deadline or pin a day from a task's ⋯ menu only when you need to.
- **Today**: a command line (Enter adds a task, each pasted line becomes one), today's run, a 7-day load strip, and **Telemetry**: each goal's % done, milestones, projected finish and whether it lands before its target.
- **Plan with AI / Sync with Claude**: send a thought plus your whole plan to Claude Haiku in-app (API key), or copy it into any Claude chat (your subscription, with research and connectors). Paste the reply back, review the proposed changes, apply. Format: see `src/lib/bridge.ts`.
- Saved in your browser. Settings → Backup to export/import a JSON copy.

**Assist** (the getting-things-done side)
- **Chat** with an AI model that runs on your own device (WebLLM + WebGPU), or with a cloud model using your own API key (Claude or any OpenAI-compatible API).
- **Google connector**: sign in once to see your Gmail inbox, the next 7 days of Google Calendar, and your Google Tasks. Chat can use them ("what should I focus on today?").
- **Settings** for model choice, API keys and your Google Client ID. Everything is stored in your browser only.

On-device models need Chrome or Edge on a laptop or desktop (WebGPU). The first message downloads the model once (1.6 to 3.9 GB depending on size), and after that it's cached. Phones should use a cloud model.

## One-time setup

### 1. Turn on GitHub Pages
Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every push to `main` then deploys automatically, in about a minute.

### 2. Google sign-in (for Gmail / Calendar / Tasks)
1. [Create a Google Cloud project](https://console.cloud.google.com/projectcreate) called "Jarvis".
2. **APIs & Services → Library**: enable **Gmail API**, **Google Calendar API** and **Google Tasks API**.
3. **OAuth consent screen**: choose External, fill in the app name and your email, and add your Google account under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. **Authorized JavaScript origins**: add `https://goodnewzcoronavirus-dot.github.io` (and `http://localhost:5173` for local development).
6. Paste the Client ID into Jarvis → Settings → Google connector.

Access is read-only. While the Google app is in "Testing" mode, only the test users you add can sign in, and sign-in lasts about an hour before it asks again.

## Develop locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

## Code map

| Path | What |
|---|---|
| `src/App.tsx` | Layout, sidebar nav, Google connection state |
| `src/components/plan/` | Plan pages: `Today`, `Buckets`, shared task/date/priority parts |
| `src/lib/plan.ts` | Buckets/goals/milestones/tasks data model and storage |
| `src/lib/breakdown.ts` | AI goal breakdown |
| `src/lib/schedule.ts` | The scheduler: do-dates, urgency, goal projections |
| `src/lib/bridge.ts` | Claude bridge: prompt builder and ```jarvis change parser |
| `src/components/` | Assist pages: `Chat`, `Inbox`, `Calendar`, `SettingsPage` |
| `src/lib/llm.ts` | One streaming chat function over on-device / Claude / OpenAI-compatible |
| `src/lib/google.ts` | Google sign-in and Gmail / Calendar / Tasks fetchers |
| `src/lib/settings.ts` | Settings and the list of on-device models |
| `.github/workflows/deploy.yml` | Build and deploy to GitHub Pages |

The original OpenJarvis-based version is on the `openjarvis-base` branch.
