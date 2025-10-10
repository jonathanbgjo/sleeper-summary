# supDawg – Weekly Sleeper Report
A Vercel-deployed Node.js app that pulls Sleeper league data, runs an OpenAI-generated weekly fantasy recap (team-by-team + trade analyzer + waiver gems + power rankings), renders it in a lightweight web UI, and posts rich Discord embeds on demand. Built with serverless API routes, native fetch, and marked.js for Markdown rendering.

## Quick start
1. `npm i`
2. Copy `.env.example` → `.env` and set values
3. Run once locally:
- `npm run report` # auto-detect current week
- `npm run report:week 6` # force week 6


Artifacts are written to `./week_<N>_report.md`.
If `DISCORD_WEBHOOK_URL` is set, the report is posted to Discord.


## Schedule
GitHub Actions workflow runs Mondays 09:30 AM ET. Update cron in `.github/workflows/weekly.yml
