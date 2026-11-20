// HQ dashboard: reads data/projects.json + one log file per bot, renders project cards.
(() => {
  const SOURCES = [['XX', 'data/xx.json'], ['ZZ', 'data/zz.json']];
  const SHOW = 5;
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const $ = s => document.querySelector(s);
  const state = { who: 'all', q: '', open: new Set() };
  let projects = [], entries = [];

  const get = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);

  // All times are shown in Malaysia time (UTC+8), whatever the viewer's device says.
  const myt = ts => { const d = new Date(new Date(ts).getTime() + 8 * 3600e3); return d; };
  const dayLabel = d => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONS[d.getUTCMonth()]}`;
  const timeLabel = d => `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  const ago = ts => {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const d = Math.floor(s / 86400);
    return d < 60 ? d + 'd ago' : Math.floor(d / 30) + 'mo ago';
  };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const highlight = (node, text) => {
    if (!state.q) { node.append(text); return; }
    const low = text.toLowerCase(), q = state.q; let i = 0, j;
    while ((j = low.indexOf(q, i)) !== -1) { node.append(text.slice(i, j), el('mark', null, text.slice(j, j + q.length))); i = j + q.length; }
    node.append(text.slice(i));
  };
  const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';

  function entryNode(e, withProject) {
    const li = el('li', 'entry');
    const d = myt(e.ts), w = el('div', 'when');
    w.append(el('b', null, dayLabel(d)), e.notime ? '' : timeLabel(d));
    w.title = e.notime ? 'Date only' : ago(e.ts);
    const b = el('div', 'body');
    b.append(el('span', 'who ' + e.who, e.who));
    if (withProject) b.append(el('span', 'tag', (projects.find(p => p.id === e.project) || { name: e.project }).name));
    highlight(b, e.text);
    if (e.out || e.link) {
      const o = el('span', 'out');
      if (e.out) highlight(o, e.out);
      const u = safeUrl(e.link);
      if (u) { if (e.out) o.append(' · '); const a = el('a', null, u.replace(/^https?:\/\//, '').slice(0, 48)); a.href = u; a.target = '_blank'; a.rel = 'noopener'; o.append(a); }
      b.append(o);
    }
    li.append(w, b);
    return li;
  }

  const visible = () => entries.filter(e =>
    (state.who === 'all' || e.who === state.who) &&
    (!state.q || (e.text + ' ' + (e.out || '')).toLowerCase().includes(state.q)));

  function render() {
    const list = visible();
    const byP = new Map(projects.map(p => [p.id, []]));
    list.forEach(e => { if (!byP.has(e.project)) byP.set(e.project, []); byP.get(e.project).push(e); });

    // Latest strip
    const latest = $('#latest'); latest.replaceChildren();
    list.slice(0, 5).forEach(e => latest.append(entryNode(e, true)));
    if (!list.length) latest.append(el('li', 'empty', 'Nothing matches.'));

    // Project cards, most recently active first
    const all = new Map(); entries.forEach(e => { const t = all.get(e.project); if (!t || e.ts > t) all.set(e.project, e.ts); });
    const order = [...byP.keys()].sort((a, b) => (all.get(b) || '').localeCompare(all.get(a) || ''));
    const grid = $('#grid'); grid.replaceChildren();
    for (const id of order) {
      const p = projects.find(x => x.id === id) || { id, name: id };
      const items = byP.get(id);
      if ((state.q || state.who !== 'all') && !items.length) continue;
      const card = el('article', 'card');
      const h = el('div', 'card-h'), t = el('h3', null, p.name);
      t.append(el('span', 'pid', p.id));
      h.append(t);
      if (p.status) h.append(el('span', 'pill' + (/^live/i.test(p.status) ? ' live' : ''), p.status));
      card.append(h);
      if (p.desc) card.append(el('p', 'desc', p.desc));
      const links = el('div', 'links');
      [['Live ↗', p.live], ['Repo ↗', p.repo]].forEach(([l, u]) => { if (safeUrl(u)) { const a = el('a', null, l); a.href = u; a.target = '_blank'; a.rel = 'noopener'; links.append(a); } });
      if (links.childNodes.length) card.append(links);

      const meta = el('div', 'meta');
      const last = all.get(id);
      meta.append(el('span', null, last ? 'Last update ' + ago(last) : 'No updates yet'));
      ['XX', 'ZZ'].forEach(w => { const n = items.filter(e => e.who === w).length; if (n) { const s = el('span', 'n'); s.append(el('i', 'dot ' + w.toLowerCase()), `${w} ${n}`); meta.append(s); } });
      card.append(meta);

      const ul = el('ol', 'feed');
      items.slice(0, SHOW).forEach(e => ul.append(entryNode(e)));
      if (!items.length) ul.append(el('li', 'empty', 'No updates yet.'));
      card.append(ul);

      if (items.length > SHOW) {
        const rest = el('ol', 'feed rest'); rest.hidden = !state.open.has(id);
        let day = '';
        items.slice(SHOW).forEach(e => {
          const dl = dayLabel(myt(e.ts)) + ' ' + myt(e.ts).getUTCFullYear();
          if (dl !== day) { day = dl; rest.append(el('li', 'day', dl)); }
          rest.append(entryNode(e));
        });
        const btn = el('button', 'more');
        const label = () => btn.textContent = rest.hidden ? `See more (${items.length - SHOW} older)` : 'Show less';
        btn.setAttribute('aria-expanded', String(!rest.hidden)); label();
        btn.onclick = () => {
          rest.hidden = !rest.hidden; btn.setAttribute('aria-expanded', String(!rest.hidden)); label();
          rest.hidden ? state.open.delete(id) : state.open.add(id);
          if (rest.hidden) card.scrollIntoView({ block: 'nearest' });
        };
        card.append(rest, btn);
      }
      grid.append(card);
    }

    // Header stats
    const today = dayLabel(myt(Date.now()));
    const n = id => entries.filter(e => e.who === id).length;
    const todayN = entries.filter(e => dayLabel(myt(e.ts)) === today && Date.now() - new Date(e.ts) < 86400e3).length;
    const st = $('#stats'); st.replaceChildren();
    [[projects.length, 'projects'], [entries.length, 'updates'], [todayN, 'today'], [n('XX'), 'by XX'], [n('ZZ'), 'by ZZ']]
      .forEach(([v, l]) => { const d = el('div'); d.append(el('b', null, String(v)), l); st.append(d); });
  }

  async function load() {
    const [proj, ...logs] = await Promise.all([get('data/projects.json'), ...SOURCES.map(([, u]) => get(u))]);
    projects = Array.isArray(proj) ? proj : [];
    entries = [];
    const missing = [];
    logs.forEach((arr, i) => {
      const who = SOURCES[i][0];
      if (!Array.isArray(arr)) { missing.push(who); return; }
      arr.forEach(e => { if (e && e.ts && !isNaN(new Date(e.ts))) entries.push({ ...e, who: e.who || who, project: e.project || 'ops', text: String(e.text || '') }); });
    });
    entries.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const err = $('#err');
    err.hidden = !missing.length;
    err.textContent = missing.length ? `Couldn't load logs for: ${missing.join(', ')}` : '';
    $('#gen').textContent = 'loaded ' + dayLabel(myt(Date.now())) + ' ' + timeLabel(myt(Date.now())) + ' MYT';
    render();
  }

  document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
    state.who = c.dataset.who; render();
  });
  let tm; $('#q').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 120); };
  load();
})();
