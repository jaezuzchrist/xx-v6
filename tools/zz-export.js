// Builds public/data/zz.json from ZZ's log.md.
// Usage: node tools/zz-export.js "<path to Claude AI v2/log.md>"
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('usage: node tools/zz-export.js <log.md>'); process.exit(1); }
const out = path.join(__dirname, '..', 'public', 'data', 'zz.json');
const MON = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };

// First match wins, so the order matters.
const RULES = [
  ['xx-v1', /Renamed brand Crew Type/i],
  ['xx-v5', /what's done on xx-v5|improve the site further|visuals vs brand/i],
  ['ops',   /summary of all|team-tracker|Mission Control|task tracker|task log|Telegram bot|GitHub renames|highest potential|shared background|Answered boss questions/i],
  ['xx-v6', /xx-v6|HQ dashboard/i],
  ['carguys', /CarGuys|JPJ|data\.gov\.my/i],
  ['xx-v4', /xx-v4|phone compare|phone comparison|Spek|Nothing brand/i],
  ['xx-v3', /xx-v3|WebShocker/i],
  ['xx-v2', /jae-repo-v2|xx-v2|Control Tower|Try Your Own Agent|Small Business OS/i],
  ['xx-v5', /xx-v5|Virtuo|studio|agency|landing page|playbook|Pinterest|brand X|Quantum Frost|showreel|storyboard|AI twin|plan picker|builder|sample reel|scroll rings|cursor|Raleway|IBM Plex|statement bands|lab images|ultra cool|creative production|pricing|privacy notice|friendliness|track record|hero background|show face|logo round|ads \+ content/i],
  ['xx-v1', /jae-repo|crew|BM \+ 中文|BM\/中文|matchup|You vs Me|types gallery|analytics|share images|famous|sharp characters|smart loader|name check|result reveal|world patterns|Round 2|compare with a friend|took the test|reviewed XX's site branch/i],
];

const scrub = s => s
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
  .replace(/\+?6?01\d[- ]?\d{3,4}[- ]?\d{4}/g, '[phone]');

// Lines that stay off HQ while it uses a simple password (same filter as XX's history.json).
const PRIVATE = /zetrix|non-compete|employment|employer|RM ?25k|salary|commission|clawback|\.env\b|token|access\.json|admin[_ -]?key|password|secret|-100\d{7,}|-50\d{8}|pairing|allowlist/i;

const items = [];
for (const raw of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
  const m = raw.match(/^- \w{3} (\d{1,2}) (\w{3}) (\d{4})\s*(~?\d{1,2}:\d{2}(?::\d{2})?)?\s*(?:ZZ:|·\s*ZZ\s*·|·)?\s*(.+)$/);
  if (!m || !MON[m[2]]) continue;
  const [, d, mon, y, t, rest] = m;
  let time = (t || '').replace('~', '');
  if (time && time.length <= 5) time += ':00';
  const pad = n => String(n).padStart(2, '0');
  const [hh, mm, ss] = time ? time.split(':') : ['00', '00', '00'];
  const ts = `${y}-${pad(MON[mon])}-${pad(d)}T${pad(hh)}:${mm}:${ss}+08:00`;

  const parts = rest.split(' · ');
  const where = parts.length > 1 ? parts.pop() : '';
  const text = parts.join(' · ').trim();
  const link = (where.match(/https?:\/\/[^\s,)]+/) || rest.match(/https?:\/\/[^\s,)]+/) || [''])[0];
  const project = (RULES.find(([, re]) => re.test(rest)) || ['ops'])[0];

  const item = { ts, project, text: scrub(text), link };
  if (where && !/^https?:\/\/\S+$/.test(where.trim())) item.out = scrub(where.trim());
  if (!time) item.notime = true;
  if (PRIVATE.test(raw)) { item.text = 'Private entry (hidden while HQ uses a simple password)'; item.link = ''; delete item.out; item.private = true; }
  items.push(item);
}
items.sort((a, b) => b.ts.localeCompare(a.ts));
fs.writeFileSync(out, JSON.stringify(items, null, 1) + '\n');
const by = {};
items.forEach(i => by[i.project] = (by[i.project] || 0) + 1);
console.log(items.length, 'entries →', out, by);
