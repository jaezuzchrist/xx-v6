// HQ dashboard. Data: data/projects.json + one log file per bot. Routes: #/ (overview), #/p/<id> (project).
(() => {
  const SOURCES = [['XX', 'data/xx.json'], ['ZZ', 'data/zz.json']];
  const SHOW = 5;
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const $ = s => document.querySelector(s);
  const state = { who: 'all', q: '', open: new Set(), expanded: new Set() };
  let projects = [], entries = [], team = null, loadErr = '';

  const get = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);

  // ---- time (always Malaysia time, whatever the device says) ----
  const myt = ts => new Date(new Date(ts).getTime() + 8 * 3600e3);
  const dayKey = ts => myt(ts).toISOString().slice(0, 10);
  const timeLabel = ts => myt(ts).toISOString().slice(11, 16);
  const dayLabel = ts => {
    const k = dayKey(ts), now = Date.now();
    if (k === dayKey(now)) return 'Today';
    if (k === dayKey(now - 864e5)) return 'Yesterday';
    const d = myt(ts), y = d.getUTCFullYear() !== myt(now).getUTCFullYear() ? ' ' + d.getUTCFullYear() : '';
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONS[d.getUTCMonth()]}${y}`;
  };
  const ago = ts => {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    if (d === 1) return 'yesterday';
    return d < 45 ? d + ' days ago' : Math.round(d / 30) + ' months ago';
  };

  // ---- dom helpers ----
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const link = (text, href, cls) => { const a = el('a', cls, text); a.href = href; return a; };
  const ext = (text, href, cls) => { const a = link(text, href, cls); a.target = '_blank'; a.rel = 'noopener'; return a; };
  const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
  const hl = (node, text) => {
    if (!state.q) { node.append(text); return node; }
    const low = text.toLowerCase(), q = state.q; let i = 0, j;
    while ((j = low.indexOf(q, i)) !== -1) { node.append(text.slice(i, j), el('mark', null, text.slice(j, j + q.length))); i = j + q.length; }
    node.append(text.slice(i)); return node;
  };
  const proj = id => projects.find(p => p.id === id) || { id, name: id };
  const pillCls = s => 'pill' + (/^live/i.test(s) ? ' live' : /build|wait/i.test(s) ? ' build' : '');

  // Split a log line into a short headline and the technical detail.
  const split = t => {
    const m = t.match(/^(.{12,110}?)(?::\s|;\s| — | → )([\s\S]+)$/);
    const bal = s => s.split('(').length === s.split(')').length;
    return m && bal(m[1]) ? [m[1].trim(), m[2].trim()] : [t, ''];
  };

  const filtered = () => entries.filter(e =>
    (state.who === 'all' || e.who === state.who) &&
    (!state.q || (e.text + ' ' + (e.out || '') + ' ' + proj(e.project).name).toLowerCase().includes(state.q)));

  function entryNode(e, showProject) {
    const li = el('li', 'entry');
    const t = el('div', 'time', e.notime ? '—' : timeLabel(e.ts));
    t.title = e.notime ? 'Time not recorded' : ago(e.ts);
    const b = el('div', 'body');
    const r1 = el('div', 'row1');
    r1.append(el('span', 'who ' + e.who, e.who));
    if (showProject) r1.append(link(proj(e.project).name, '#/p/' + encodeURIComponent(e.project), 'ptag'));
    b.append(r1);

    const [head, detail] = split(e.text);
    const txt = el('div', 'txt');
    hl(txt.appendChild(el('strong')), head);
    if (detail) { txt.append(' '); hl(txt.appendChild(el('span', 'det')), detail); }
    b.append(txt);
    const key = e.ts + e.who + e.text.slice(0, 20);
    const long = e.text.length > 120 && !state.q;
    if (long && !state.expanded.has(key)) txt.classList.add('clamp');
    if (long) {
      const x = el('button', 'expand', state.expanded.has(key) ? 'Less' : 'More');
      x.onclick = () => { const on = txt.classList.toggle('clamp'); on ? state.expanded.delete(key) : state.expanded.add(key); x.textContent = on ? 'More' : 'Less'; };
      b.append(x);
    }
    const u = safeUrl(e.link);
    if (e.out || u) {
      const o = el('span', 'out');
      if (e.out) hl(o, e.out);
      if (u) { if (e.out) o.append(' · '); o.append(ext(u.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 46) + ' ↗', u)); }
      b.append(o);
    }
    li.append(t, b);
    return li;
  }

  // Render a list grouped under day headers.
  function timeline(list, showProject) {
    const frag = document.createDocumentFragment();
    let day = '', ul;
    const counts = {}; list.forEach(e => { const k = dayKey(e.ts); counts[k] = (counts[k] || 0) + 1; });
    list.forEach(e => {
      const k = dayKey(e.ts);
      if (k !== day) {
        day = k;
        const h = el('div', 'day', dayLabel(e.ts));
        h.append(el('span', 'cnt', counts[k] > 1 ? `${counts[k]} updates` : ''));
        frag.append(h);
        ul = frag.appendChild(el('ol', 'feed'));
      }
      ul.append(entryNode(e, showProject));
    });
    return frag;
  }

  function lastOf(id) { const e = entries.find(x => x.project === id); return e ? e.ts : ''; }

  // ---- remote: opens Telegram's share screen with the command typed (boss picks the group + Send) ----
  const REMOTE = [
    ['⏳', 'Waiting on me?', 'HQ: waiting on me?'],
    ['☀️', 'Morning brief', 'HQ: morning brief'],
    ['🩺', 'Check all sites', 'HQ: check all sites'],
    ['✅', 'Go', 'HQ: go'],
    ['✋', 'Stop', 'HQ: stop'],
    ['📝', 'Quick note', 'HQ: note: '],
  ];
  let toastT;
  const toast = msg => { let t = $('#toast'); if (!t) { t = el('div', 'toast'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); };
  const send = text => {
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    window.open('https://t.me/share/url?url=' + encodeURIComponent(text), '_blank', 'noopener');
    toast('Telegram is opening with "' + text.trim() + '" typed. Pick the HQ group, then Send. (Also copied.)');
  };
  const rbtn = (icon, label, text, cls) => { const b = el('button', 'rbtn' + (cls ? ' ' + cls : '')); b.append(el('span', 'ic', icon), label); b.title = 'Sends: ' + text.trim(); b.onclick = () => send(text); return b; };
  function remote(v) {
    const box = el('div', 'remote');
    REMOTE.forEach(([i, l, t]) => box.append(rbtn(i, l, t, l === 'Stop' ? 'stop' : '')));
    v.append(box);
  }

  // ---- side nav ----
  function renderNav(active) {
    const nav = $('#nav'); nav.replaceChildren();
    const list = filtered();
    const home = link('', '#/', active ? '' : 'on');
    home.append(el('span', 'nm', 'Overview'), el('span', 'ct', String(list.length)));
    nav.append(home);
    if (team) { const tm = link('', '#/team', active === '#team' ? 'on' : ''); tm.append(el('span', 'nm', 'Team & roles'), el('span', 'ct', '')); nav.append(tm); }
    nav.append(el('div', 'lbl', 'Projects'));
    sortedProjects().forEach(p => {
      const n = list.filter(e => e.project === p.id).length;
      const last = lastOf(p.id);
      const a = link('', '#/p/' + encodeURIComponent(p.id), (p.id === active ? 'on' : '') + (last && Date.now() - new Date(last) < 864e5 ? ' fresh' : ''));
      a.append(el('span', 'nm', p.name), el('span', 'ct', String(n)), el('span', 'ag', last ? ago(last) : 'no updates'));
      if (p.id === active) a.setAttribute('aria-current', 'page');
      nav.append(a);
    });
    const on = nav.querySelector('.on');
    if (on && matchMedia('(max-width:900px)').matches) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  const sortedProjects = () => {
    const ids = new Set(projects.map(p => p.id)); entries.forEach(e => ids.add(e.project));
    return [...ids].map(proj).sort((a, b) => lastOf(b.id).localeCompare(lastOf(a.id)));
  };

  // ---- views ----
  function overview(v) {
    const list = filtered();
    v.append(el('p', 'crumb', 'Overview'), el('h1', null, 'What everyone has been doing'));
    v.append(el('p', 'lede', 'Tap a project to see its full history. Newest first. Times are Malaysia time.'));
    remote(v);

    const today = list.filter(e => dayKey(e.ts) === dayKey(Date.now())).length;
    const week = list.filter(e => Date.now() - new Date(e.ts) < 7 * 864e5).length;
    const nums = el('div', 'nums');
    [[today, 'today'], [week, 'this week'], [list.filter(e => e.who === 'XX').length, 'by XX'], [list.filter(e => e.who === 'ZZ').length, 'by ZZ']]
      .forEach(([n, l]) => { const d = el('div', 'num'); d.append(el('b', null, String(n)), el('span', null, l)); nums.append(d); });
    v.append(nums);

    const waits = projects.filter(p => p.waiting);
    if (waits.length && !state.q) {
      v.append(el('h2', null, 'Waiting on you'));
      const c = el('div', 'card'), ul = el('ol', 'feed');
      waits.forEach(p => { const li = el('li', 'entry wait'); li.append(link(p.name, '#/p/' + encodeURIComponent(p.id), 'ptag'), el('div', 'txt', p.waiting)); ul.append(li); });
      c.append(ul); v.append(c);
    }

    v.append(el('h2', null, 'Projects'));
    const tiles = el('div', 'tiles');
    sortedProjects().forEach(p => {
      const items = list.filter(e => e.project === p.id);
      if ((state.q || state.who !== 'all') && !items.length) return;
      const t = link('', '#/p/' + encodeURIComponent(p.id), 'tile');
      const h = el('div', 'tile-h'); h.append(el('h3', null, p.name));
      if (p.status) h.append(el('span', pillCls(p.status), p.status));
      t.append(h);
      const e = items[0];
      t.append(el('div', 'last', e ? split(e.text)[0] : (p.desc || 'No updates yet.')));
      const f = el('div', 'foot');
      f.append(el('span', null, e ? `${e.who} · ${ago(e.ts)}` : ''), el('span', 'open', `${items.length} updates →`));
      t.append(f);
      tiles.append(t);
    });
    if (!tiles.children.length) tiles.append(el('p', 'empty', 'Nothing matches.'));
    v.append(tiles);

    v.append(el('h2', null, 'Latest updates'));
    const c = el('div', 'card');
    c.append(list.length ? timeline(list.slice(0, 12), true) : el('p', 'empty', 'Nothing matches.'));
    v.append(c);
  }

  function project(v, id) {
    const p = proj(id), items = filtered().filter(e => e.project === id);
    const cr = el('p', 'crumb'); cr.append(link('← Overview', '#/'));
    v.append(cr);
    const ph = el('div', 'phead'); ph.append(el('h1', null, p.name));
    if (p.status) ph.append(el('span', pillCls(p.status), p.status));
    v.append(ph);
    if (p.desc) v.append(el('p', 'lede', p.desc));
    const links = el('div', 'links');
    if (safeUrl(p.live)) links.append(ext('Open site ↗', p.live, 'btn'));
    if (safeUrl(p.repo)) links.append(ext('Code ↗', p.repo, 'btn'));
    links.append(rbtn('📊', 'Status', 'HQ: status ' + p.id), rbtn('👀', 'Show me', 'HQ: show me ' + p.id));
    if (links.children.length) v.append(links);
    if (p.waiting) { v.append(el('h2', null, 'Waiting on you')); const c = el('div', 'card'); c.append(el('p', 'txt', p.waiting)); v.append(c); }

    const xx = items.filter(e => e.who === 'XX').length, zz = items.length - xx;
    v.append(el('h2', null, `Updates · ${items.length}${items.length ? ` (XX ${xx} · ZZ ${zz})` : ''}`));
    const c = el('div', 'card');
    if (!items.length) { c.append(el('p', 'empty', state.q || state.who !== 'all' ? 'Nothing matches.' : 'No updates yet.')); v.append(c); return; }
    const showAll = state.open.has(id) || state.q;
    c.append(timeline(showAll ? items : items.slice(0, SHOW)));
    if (items.length > SHOW && !state.q) {
      const b = el('button', 'more', showAll ? 'Show less' : `See more · ${items.length - SHOW} older updates`);
      b.onclick = () => { showAll ? state.open.delete(id) : state.open.add(id); render(); if (showAll) v.scrollIntoView(); };
      c.append(b);
    }
    v.append(c);
  }

  function teamView(v) {
    const cr = el('p', 'crumb'); cr.append(link('← Overview', '#/')); v.append(cr);
    v.append(el('h1', null, 'Team & roles'), el('p', 'lede', 'Who does what, and how XX and ZZ avoid stepping on each other.'));
    const g = el('div', 'tiles');
    (team.members || []).forEach(m => {
      const c = el('div', 'tile mem ' + m.id);
      const h = el('div', 'tile-h'), t = el('h3'); t.append(el('span', 'who ' + m.id, m.name), ' ', m.role || '');
      h.append(t); c.append(h);
      const ul = el('ul', 'does'); (m.does || []).forEach(d => ul.append(el('li', null, d))); c.append(ul);
      g.append(c);
    });
    v.append(g);
    if ((team.rules || []).length) {
      v.append(el('h2', null, 'How we avoid clashing'));
      const c = el('div', 'card'), ol = el('ol', 'rules'); team.rules.forEach(r => ol.append(el('li', null, r))); c.append(ol); v.append(c);
    }
  }

  function render() {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    const id = m ? decodeURIComponent(m[1]) : '';
    const v = $('#view'); v.replaceChildren();
    if (loadErr) v.append(el('p', 'err', loadErr));
    const isTeam = location.hash === '#/team' && team;
    isTeam ? teamView(v) : id ? project(v, id) : overview(v);
    renderNav(isTeam ? '#team' : id);
    document.title = (isTeam ? 'Team · ' : id ? proj(id).name + ' · ' : '') + 'HQ';
  }

  async function load() {
    const [proj_, team_, wait_, ...logs] = await Promise.all([get('data/projects.json'), get('data/team.json'), get('data/waiting.json'), ...SOURCES.map(([, u]) => get(u))]);
    projects = Array.isArray(proj_) ? proj_ : [];
    team = team_ && Array.isArray(team_.members) ? team_ : null;
    // waiting.json (XX's file) wins over the "waiting" field in projects.json: [{"project":"xx-v5","text":"…"}]
    if (Array.isArray(wait_)) {
      projects.forEach(p => delete p.waiting);
      wait_.forEach(w => { if (!w || !w.text) return; let p = projects.find(x => x.id === w.project); if (!p) { p = { id: w.project || 'ops', name: w.project || 'General' }; projects.push(p); } p.waiting = p.waiting ? p.waiting + ' · ' + w.text : String(w.text); });
    }
    entries = []; const missing = [];
    logs.forEach((arr, i) => {
      const who = SOURCES[i][0];
      if (!Array.isArray(arr)) { missing.push(who); return; }
      arr.forEach(e => { if (e && e.ts && !isNaN(new Date(e.ts))) entries.push({ ...e, who: e.who || who, project: e.project || 'ops', text: String(e.text || '') }); });
    });
    entries.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    loadErr = missing.length ? `Couldn't load updates from ${missing.join(' and ')}.` : '';
    $('#gen').textContent = 'loaded ' + timeLabel(Date.now());
    render();
  }

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
    state.who = c.dataset.who; render();
  });
  let tm; $('#q').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 150); };
  load();
})();
