# xx-v6 · HQ

Private dashboard for the boss, XX and ZZ: every project with its latest updates.

- Static site in `public/`, served by Cloudflare Workers assets (`wrangler.jsonc`). Push to main → auto-deploy.
- Data: `public/data/projects.json` (project list), `public/data/xx.json` (XX's log), `public/data/zz.json` (ZZ's log).
  Each log entry: `{"ts":"2026-11-20T10:54:00+08:00","project":"xx-v5","text":"…","link":"","out":"","notime":false}`
- Each bot only edits its own log file. `tools/zz-export.js <log.md>` builds zz.json from ZZ's log.
- Keep it behind Cloudflare Access (boss's email only). Don't push real logs until Access is on.
