# Jarvis

A personal productivity copilot that runs entirely in your browser. There's no server and nothing to install.

**Live app:** https://goodnewzcoronavirus-dot.github.io/jarvis-CORE/

## What it does now

**Plan** (the organizing side)
- **Buckets > Goals > Milestones > Tasks.** Goals have a target date and a "why". Tasks can also sit directly in a bucket.
- **Jarvis schedules for you.** Every open task gets a do-date: earliest deadline first, inherited from its milestone or goal, with a daily limit (default 4/day). Steps inside a goal or milestone keep the order you added them. Set a deadline or pin a day from a task's ⋯ menu only when you need to.
- **Today**: one "Do this now" task (Done / Later), the rest of today, an add-task box, this week as a mini calendar, and each goal's progress with a note only when something needs attention.
- **Calendar (home screen)**: Canvas-style. Left: New task, a mini month with colored dots, and your buckets as color toggles. Center: Month / Week / Agenda with tasks as bucket-colored chips, milestones (◆), goal targets (⚑) and Google events. Right: today's to-do list and what's coming up. Click a day to add a task on it, click a task for details, drag to reschedule. Keys: ← → move, T today, M/W/A views, N new task.
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

## Jarvis Cloud: the Claude connector

Jarvis Cloud is a tiny server (a free Cloudflare Worker, code in `worker/`) that holds your plan. Two things talk to it:

- **The Jarvis app** syncs to it, so your laptop and phone show the same plan.
- **Claude** reaches it as a custom connector, so in any chat you can say *"find my Elaina Morris task, draft the email in Gmail and update the task"* and Claude reads and changes your plan directly.

Connector tools: `get_overview`, `get_schedule`, `search_tasks`, `get_task`, `add_tasks`, `update_task`, `complete_task`, `delete_task`, `add_goal`, `update_goal`, `add_milestone`, `update_milestone`, `add_bucket`.

### Set it up (about 10 minutes, all in the browser)

One Cloudflare Worker (config: `wrangler.toml` at the repo root) serves the Jarvis app and runs the server behind it (`/api/*`, `/mcp/*`).

1. **Make a token.** In Jarvis → Settings → Jarvis Cloud, click **Generate**. It's copied to your clipboard. Paste it somewhere safe. It's the password to your plan.
2. **Deploy.** Create a free account at [Cloudflare](https://dash.cloudflare.com/sign-up), then go to **Workers & Pages → Create → Import a repository** and pick this repo. Use project name `jarvis-core` (it must match `name` in `wrangler.toml`), leave **root directory** empty, use build command `npm run build`, and deploy command `npx wrangler deploy`.
3. **Add the secret.** In the Worker, go to **Settings → Variables and Secrets → Add**: type **Secret**, name `JARVIS_TOKEN`, value: your token. Check it worked by opening `https://jarvis-core.<you>.workers.dev/api/health`. It should show `{"ok":true,...}`.
4. **Connect the app.** In the Jarvis that already has your tasks, go to Settings → Jarvis Cloud, paste the Worker URL and token, then **Connect**. That uploads your plan. On any other device or address (including the workers.dev one), connect with the same token and choose **Use the server's plan**.
5. **Add the connector to Claude.** Copy the **Connector URL** from Settings (`https://…workers.dev/mcp/<token>`). In Claude, go to **Settings → Connectors → Add custom connector**, name it `Jarvis`, paste the URL, and leave OAuth empty.

Every push to `main` redeploys the Worker automatically.

**Security:** the token is in the connector URL, so treat that URL like a password. Anyone with it can read and change your plan. If it leaks, change `JARVIS_TOKEN` in Cloudflare, then reconnect the app and update the connector URL.

### Run it locally

```bash
npm run build                                             # the app, into dist/
echo "JARVIS_TOKEN=some-long-random-test-token-123" > .dev.vars
npx wrangler dev                                          # app + API + MCP at http://localhost:8787
```

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
| `src/components/plan/PlanCalendar.tsx` | Week/month calendar and the task detail sheet |
| `src/lib/schedule.ts` | The scheduler: do-dates, urgency, goal projections |
| `src/lib/bridge.ts` | Claude bridge: prompt builder and ```jarvis change parser |
| `src/components/` | Assist pages: `Chat`, `Inbox`, `Calendar`, `SettingsPage` |
| `src/lib/llm.ts` | One streaming chat function over on-device / Claude / OpenAI-compatible |
| `src/lib/google.ts` | Google sign-in and Gmail / Calendar / Tasks fetchers |
| `src/lib/settings.ts` | Settings and the list of on-device models |
| `wrangler.toml`, `worker/` | Jarvis Cloud: one Cloudflare Worker that serves the app plus the plan store, sync API and MCP connector |
| `src/lib/sync.ts` | App ↔ Jarvis Cloud sync |
| `src/lib/core.ts`, `src/lib/schedule-core.ts` | Pure plan model and scheduler shared by the app and the Worker |
| `.github/workflows/deploy.yml` | Build and deploy to GitHub Pages |

The original OpenJarvis-based version is on the `openjarvis-base` branch.
