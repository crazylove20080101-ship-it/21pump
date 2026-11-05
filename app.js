// 21PUMP 戰情：畫面與路由。頁面：#/home 戰情、#/report 填報、#/events 事件、#/targets 目標。
import api, { DEMO } from './db.js';
import {
  FIELDS, REQUIRED_KEYS, TARGET_FIELDS, METRICS, KIND_LABEL, RATE_RULES,
  todayStr, addDays, weekday, monthStart, daysInMonth,
  baseline, vsBaseline, toneLabel, rate, currentTarget, monthProgress, buildTasks, sumRange, pct,
} from './metrics.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '日一二三四五六';
const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const HISTORY_DAYS = 120;

const S = {
  profile: null, store: null, today: todayStr(),
  byDate: new Map(), targets: [], events: [], logs: [],
  reportDate: null, eventFilter: 'open', range: 30, metric: null,
};

const fmt = (key, v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const m = METRICS[key];
  if (m?.unit === 'money') return S.store.currency + Math.round(v).toLocaleString('en-US');
  return m?.decimals ? v.toFixed(m.decimals) : String(Math.round(v));
};
const money = v => S.store.currency + Math.round(v || 0).toLocaleString('en-US');
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200); };

// ───────────── 啟動 ─────────────
async function boot() {
  api.onAuth(s => { if (!s) { S.profile = null; renderLogin(); } });
  const session = await api.session();
  if (!session) return renderLogin();
  await enter();
}

async function enter() {
  S.profile = await api.profile();
  if (!S.profile || !S.profile.store) {
    $('#app').innerHTML = `<div class="login"><h1>帳號尚未開通</h1><p class="muted">這個帳號還沒綁定門店。請管理者在 Supabase 執行 add_user.sql 綁定後再登入。</p><button class="btn" id="out">登出</button></div>`;
    $('#out').onclick = () => api.signOut();
    return;
  }
  S.store = S.profile.store;
  await loadAll();
  if (!enter.bound) { window.addEventListener('hashchange', route); enter.bound = true; }
  route();
}

async function loadAll() {
  S.today = todayStr();
  const [reports, targets, events, logs] = await Promise.all([
    api.reports(S.store.id, addDays(S.today, -HISTORY_DAYS), S.today),
    api.targets(S.store.id, monthStart(S.today)),
    api.events(S.store.id),
    api.taskLogs(S.store.id, S.today),
  ]);
  S.byDate = new Map(reports.map(r => [r.report_date, r]));
  S.targets = targets; S.events = events; S.logs = logs;
}

// ───────────── 登入 ─────────────
function renderLogin() {
  $('#app').innerHTML = `
    <form class="login" id="loginForm">
      <h1>21PUMP 戰情</h1>
      <p class="muted" style="margin:0 0 18px">${DEMO ? '示範模式：尚未連接 Supabase，直接按登入即可看畫面。' : '請用管理者給你的帳號登入。'}</p>
      <div class="stack"><label for="em">Email</label><input id="em" type="email" autocomplete="username" ${DEMO ? '' : 'required'}></div>
      <div class="stack"><label for="pw">密碼</label><input id="pw" type="password" autocomplete="current-password" ${DEMO ? '' : 'required'}></div>
      <div class="err" id="err"></div>
      <button class="btn primary block" style="margin-top:8px">登入</button>
    </form>`;
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button'); b.disabled = true; $('#err').textContent = '';
    try { await api.signIn($('#em').value.trim(), $('#pw').value); await enter(); }
    catch (err) { $('#err').textContent = err.message; b.disabled = false; }
  };
}

// ───────────── 外框 ─────────────
const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  report: '<path d="M8 4h8l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M9 12h6M9 16h4"/>',
  events: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M17 8h4M19 6v4"/>',
  targets: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
};
const PAGES = { home: '戰情', report: '填報', events: '事件', targets: '目標' };

function shell(page, title, sub, body) {
  const openOverdue = S.events.some(e => e.status === 'open' && e.due_date && e.due_date <= S.today);
  const missing = !S.byDate.has(S.today);
  $('#app').innerHTML = `
    <div class="app">
      <header class="top">
        <div class="top-title"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
        <button class="chip-btn" id="acct">${esc(S.store.name)} · 登出</button>
      </header>
      ${DEMO ? `<div class="banner"><span>示範模式：虛構資料，只存在這台瀏覽器</span><button id="resetDemo">重設示範資料</button></div>` : ''}
      <main>${body}</main>
    </div>
    <nav class="nav"><div class="nav-in">
      ${Object.entries(PAGES).map(([k, l]) => `<a href="#/${k}" ${k === page ? 'aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>
        ${(k === 'events' && openOverdue) || (k === 'report' && missing) ? '<span class="dot"></span>' : ''}${l}</a>`).join('')}
    </div></nav>
    <div class="scrim" id="scrim" hidden></div>
    <div class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="sheet-in" id="sheetIn"></div></div>`;
  $('#acct').onclick = () => { if (confirm('要登出嗎？')) api.signOut(); };
  $('#resetDemo')?.addEventListener('click', () => api.resetDemo());
  $('#scrim').onclick = closeSheet;
}
const dateSub = d => `${+d.slice(5, 7)}月${+d.slice(8, 10)}日 週${WD[weekday(d)]}`;

function route() {
  const page = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'home';
  window.scrollTo({ top: 0 });
  ({ home: renderHome, report: renderReport, events: renderEvents, targets: renderTargets }[page] || renderHome)();
}

// ───────────── 戰情首頁 ─────────────
function renderHome() {
  const d = S.today, r = S.byDate.get(d);
  const status = !r ? '今日尚未填報' : r.closed ? '今日公休' : '今日已填報';
  const tasks = buildTasks({ date: d, byDate: S.byDate, targets: S.targets, events: S.events, cur: S.store.currency });
  const doneMap = new Map(S.logs.map(l => [l.rule_key, l]));
  const t = currentTarget(S.targets, d);

  shell('home', '今日戰情', `${dateSub(d)} · ${status}`, `
    <div class="kpis">${['revenue', 'leads', 'trials', 'deals'].map(k => kpiTile(k, d)).join('')}</div>

    <div class="sec-head"><h2>今日三件事</h2><span class="meta">${tasks.filter(x => doneMap.has(x.key)).length} / ${tasks.length} 完成</span></div>
    <div class="tasks">${tasks.length ? tasks.map((x, i) => taskCard(x, i, doneMap.get(x.key))).join('') : `<div class="empty-box">目前沒有需要特別處理的事。數字都在常態範圍內。</div>`}</div>

    <div class="sec-head"><h2>本月進度</h2><a class="meta" href="#/targets">${t ? '調整目標' : '設定目標'}</a></div>
    ${monthCard(d, t)}

    <div class="sec-head"><h2>招生漏斗</h2><span class="meta">近 7 天</span></div>
    ${funnelCard(d)}

    <div class="sec-head"><h2>全部指標</h2><span class="meta">今日 vs 常態</span></div>
    <div class="card">${metricTable(d)}
      <p class="small dim" style="margin:10px 0 0">常態值＝最近 6 個同星期幾（不含公休）去掉最高、最低後的平均；資料不足時用最近 14 個開店日。±15% 內算正常。點任一列看走勢。</p>
    </div>

    <div class="sec-head"><h2>進行中的事件</h2><a class="meta" href="#/events">全部</a></div>
    ${eventList(S.events.filter(e => e.status === 'open').sort(byDue).slice(0, 4), true)}
  `);

  document.querySelectorAll('[data-metric]').forEach(el => el.onclick = () => openMetric(el.dataset.metric));
  document.querySelectorAll('[data-task]').forEach(el => el.onclick = () => taskAction(tasks[+el.dataset.task], el.dataset.act));
  document.querySelectorAll('[data-undo]').forEach(el => el.onclick = async () => { await api.unlogTask(S.store.id, S.today, el.dataset.undo); S.logs = S.logs.filter(l => l.rule_key !== el.dataset.undo); renderHome(); });
  bindEventRows();
}

function kpiTile(k, d) {
  const r = S.byDate.get(d), v = r && !r.closed ? METRICS[k].calc(r.data) : null;
  const b = baseline(k, d, S.byDate), cmp = vsBaseline(k, v, b.value);
  const vals = [];
  for (let i = 13; i >= 0; i--) { const x = S.byDate.get(addDays(d, -i)); vals.push(x && !x.closed ? METRICS[k].calc(x.data) : null); }
  const valHTML = v == null ? `<span class="kpi-val empty">${r?.closed ? '公休' : '未填'}</span>`
    : METRICS[k].unit === 'money' ? `<span class="kpi-val"><small>${esc(S.store.currency)}</small>${Math.round(v).toLocaleString('en-US')}</span>`
    : `<span class="kpi-val">${v}<small style="margin-left:3px">${METRICS[k].unit}</small></span>`;
  return `<button class="kpi" data-metric="${k}" aria-label="${METRICS[k].label}，查看走勢">
    <span class="kpi-label">${METRICS[k].label}</span>${valHTML}
    <span>${toneTag(k, cmp)}</span>
    <span class="kpi-base">常態 ${b.value == null ? b.basis : fmt(k, b.value)}</span>
    <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none">${sparkPath(vals)}</svg></button>`;
}
function toneTag(k, cmp) {
  const p = cmp.pct == null || Math.round(cmp.pct * 100) === 0 ? '' : ` ${cmp.pct > 0 ? '▲' : '▼'}${Math.abs(Math.round(cmp.pct * 100))}%`;
  return `<span class="tag t-${cmp.tone}">${toneLabel(k, cmp)}${cmp.tone === 'none' ? '' : p}</span>`;
}
function sparkPath(vals) {
  const xs = vals.filter(v => v != null);
  if (xs.length < 2) return '';
  const max = Math.max(...xs), min = Math.min(...xs), span = (max - min) || 1;
  let dStr = '', pen = false;
  vals.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    dStr += `${pen ? 'L' : 'M'}${(i / (vals.length - 1) * 100).toFixed(1)},${(26 - (v - min) / span * 24).toFixed(1)}`; pen = true;
  });
  return `<path d="${dStr}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
}

function taskCard(x, i, done) {
  const tone = x.tone === 'warn' ? 't-warn' : 't-accent';
  if (done) return `<div class="task done"><div class="task-top"><span class="task-no">${i + 1}</span><span class="tag ${tone}">${esc(x.tag)}</span></div>
    <h3>${esc(x.title)}</h3><div class="done-row"><span class="ok">✓ ${esc(done.result || '已處理')}</span><button data-undo="${x.key}">復原</button></div></div>`;
  return `<div class="task"><div class="task-top"><span class="task-no">${i + 1}</span><span class="tag ${tone}">${esc(x.tag)}</span></div>
    <h3>${esc(x.title)}</h3>
    <div class="why"><b>為什麼</b><span>${esc(x.why)}</span></div>
    <div class="acts">
      ${x.link ? `<a class="btn ${x.noLog ? 'primary' : ''}" href="${x.link}">前往處理</a>` : ''}
      ${x.noLog ? '' : `<button class="btn primary" data-task="${i}" data-act="done">完成，記結果</button>
      <button class="btn" data-task="${i}" data-act="skip">今天不處理</button>`}
    </div></div>`;
}
async function taskAction(x, act) {
  let result = '今天不處理';
  if (act === 'done') {
    const r = prompt('做了什麼？結果如何？（例：已打給 3 位家長，1 位約週六再體驗）', '');
    if (r === null) return;
    result = r.trim() || '已處理';
  }
  const row = { task_date: S.today, rule_key: x.key, title: x.title, result };
  await api.logTask(S.store.id, row);
  S.logs = S.logs.filter(l => l.rule_key !== x.key).concat(row);
  toast('已記錄');
  renderHome();
}

function monthCard(d, t) {
  if (!t) return `<div class="empty-box">還沒設定本月目標。<a href="#/targets">去設定</a>，就能看到達成率、時間進度和每天需要多少。</div>`;
  const p = monthProgress(S.byDate, d, t, 'revenue');
  const toneTxt = p.pct == null ? '' : p.pct >= p.pace ? `超前 ${Math.round((p.pct - p.pace) * 100)}%` : `落後 ${Math.round((p.pace - p.pct) * 100)}%`;
  const mini = ['consume', 'deals'].filter(k => Number(t.targets?.[k])).map(k => {
    const q = monthProgress(S.byDate, d, t, k);
    return `<div class="card"><div class="small muted">${k === 'consume' ? '耗課' : '新生'}</div>
      <div class="v">${k === 'consume' ? money(q.mtd) : q.mtd}<span class="small dim"> / ${k === 'consume' ? money(q.goal) : q.goal}</span></div>
      <div class="bar"><span style="width:${Math.min(100, (q.pct || 0) * 100).toFixed(1)}%"></span><i class="pace" style="left:calc(${(q.pace * 100).toFixed(1)}% - 1px)"></i></div>
      <div style="margin-top:8px"><span class="tag t-${q.tone}">${q.pct == null ? '—' : pct(q.pct)}</span></div></div>`;
  }).join('');
  return `<div class="card">
      <div class="small muted">本月實收 · 第 ${p.day} / ${p.dim} 天</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="prog-big">${money(p.mtd)}</span><span class="small muted">目標 ${money(p.goal)}</span></div>
      <div class="bar"><span style="width:${Math.min(100, (p.pct || 0) * 100).toFixed(1)}%"></span><i class="pace" style="left:calc(${(p.pace * 100).toFixed(1)}% - 1px)"></i></div>
      <div class="prog-row"><span class="tag t-${p.tone}">${toneTxt}</span><span class="small muted">剩 ${p.remain} 天，每天需 ${money(p.needPerDay)}</span></div>
      <div class="small dim" style="margin-top:6px">照目前速度，月底約 ${money(p.projected)}。白色刻度是照時間應有的進度。</div>
    </div>${mini ? `<div class="mini-goals">${mini}</div>` : ''}`;
}

function funnelCard(d) {
  const from = addDays(d, -6);
  const steps = [['線索', 'leads'], ['邀約', 'invites'], ['試課', 'trials'], ['成交', 'deals']].map(([l, k]) => [l, sumRange(S.byDate, from, d, k)]);
  const max = Math.max(1, steps[0][1]);
  const rates = [rate(S.byDate, d, 'invite'), rate(S.byDate, d, 'show'), rate(S.byDate, d, 'close')];
  return `<div class="card">${steps.map(([l, v], i) => `
    ${i ? `<div class="f-conv">↓ ${pct(rates[i - 1].value)} ${rates[i - 1].tone !== 'none' ? `<span class="tag t-${rates[i - 1].tone}">${rates[i - 1].label}${rates[i - 1].tone === 'bad' ? '低於門檻' : rates[i - 1].tone === 'warn' ? '待加強' : '達標'}</span>` : ''}</div>` : ''}
    <div class="f-step"><span>${l}</span><div class="fb"><span style="width:${(v / max * 100).toFixed(1)}%"></span></div><span class="fn">${v}</span></div>`).join('')}
    <p class="small dim" style="margin:10px 0 0">門檻來自門店手冊：到店率 &lt;70% 紅、≥85% 綠；成交率 &lt;40% 紅、≥60% 綠。比率用 7 天加總後再除，避免單日人數太少失真。</p></div>`;
}

function metricTable(d) {
  const r = S.byDate.get(d);
  return `<table class="mtable"><thead><tr><th>指標</th><th>今日</th><th>常態</th><th>狀態</th></tr></thead><tbody>
    ${Object.keys(METRICS).map(k => {
      const v = r && !r.closed ? METRICS[k].calc(r.data) : null;
      const b = baseline(k, d, S.byDate);
      return `<tr data-metric="${k}"><td>${METRICS[k].label}</td><td>${fmt(k, v)}</td><td class="dim">${b.value == null ? '—' : fmt(k, b.value)}</td><td>${toneTag(k, vsBaseline(k, v, b.value))}</td></tr>`;
    }).join('')}</tbody></table>`;
}

// ───────────── 指標走勢 sheet ─────────────
function openMetric(k) {
  S.metric = k;
  $('#scrim').hidden = false; $('#sheet').classList.add('open');
  renderMetric();
}
function closeSheet() { $('#sheet')?.classList.remove('open'); const s = $('#scrim'); if (s) s.hidden = true; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function renderMetric() {
  const k = S.metric, m = METRICS[k], d = S.today;
  const dates = Array.from({ length: S.range }, (_, i) => addDays(d, -(S.range - 1 - i)));
  const vals = dates.map(x => { const r = S.byDate.get(x); return r && !r.closed ? m.calc(r.data) : null; });
  const bases = dates.map(x => baseline(k, x, S.byDate).value);
  const filled = vals.filter(v => v != null);
  const avg = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
  const b = baseline(k, d, S.byDate);
  $('#sheetIn').innerHTML = `
    <div class="grab"></div>
    <div class="sheet-head"><div><div class="small muted">${m.label} · ${esc(S.store.name)}</div>
      <div class="big">${fmt(k, vals.at(-1))}</div><div style="margin-top:4px">${toneTag(k, vsBaseline(k, vals.at(-1), b.value))}</div></div>
      <button class="close" id="closeSheet" aria-label="關閉"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="tabs" role="tablist">${[14, 30, 90].map(n => `<button role="tab" data-r="${n}" aria-selected="${n === S.range}">${n} 天</button>`).join('')}</div>
    <div class="legend"><span><i></i>每日實際</span><span><i class="base"></i>常態值</span></div>
    <div class="readout" id="readout"></div>
    <svg class="chart" id="chart"></svg>
    <div class="summary">
      <div><div class="k">區間日均</div><div class="v">${fmt(k, avg)}</div></div>
      <div><div class="k">今日常態</div><div class="v">${b.value == null ? '—' : fmt(k, b.value)}</div></div>
      <div><div class="k">有填報天數</div><div class="v">${filled.length}</div></div>
    </div>
    <div class="explain">常態依據：${esc(b.basis)}。${m.better === 'down' ? '這個指標越低越好。' : ''}資料越多，常態值越穩。</div>`;
  $('#closeSheet').onclick = closeSheet;
  document.querySelectorAll('[data-r]').forEach(el => el.onclick = () => { S.range = +el.dataset.r; renderMetric(); });
  requestAnimationFrame(() => drawChart(k, dates, vals, bases));
}

function drawChart(k, dates, vals, bases) {
  const svg = $('#chart'); if (!svg) return;
  const W = svg.clientWidth || 400, H = 200, L = 50, R = 8, T = 10, B = 24;
  const all = [...vals, ...bases].filter(v => v != null);
  const max = Math.max(1, ...all);
  const step = niceStep(max / 3), top = Math.max(step, Math.ceil(max / step) * step);
  const x = i => L + (dates.length === 1 ? 0 : i / (dates.length - 1)) * (W - L - R);
  const y = v => T + (1 - v / top) * (H - T - B);
  const path = arr => { let s = '', pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } s += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return s; };
  const ticks = [0, top / 3, top * 2 / 3, top];
  const tl = v => METRICS[k].unit === 'money' ? (v >= 10000 ? (v / 10000).toFixed(v % 10000 ? 1 : 0) + '萬' : Math.round(v).toLocaleString('en-US')) : (Math.round(v * 10) / 10);
  const xi = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  const lastI = vals.map((v, i) => v != null ? i : -1).filter(i => i >= 0).at(-1);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="var(--dim)" font-size="11" font-family="var(--num)">${tl(v)}</text>`).join('')}
    ${xi.map((i, j) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][j]}" fill="var(--dim)" font-size="11" font-family="var(--num)">${md(dates[i])}</text>`).join('')}
    <path d="${path(bases)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/>
    <path d="${path(vals)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <line id="guide" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3" opacity="0"/>
    <circle id="dot" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" ${lastI == null ? 'opacity="0"' : `cx="${x(lastI)}" cy="${y(vals[lastI])}"`}/>
    <rect id="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>`;
  const read = i => {
    const r = S.byDate.get(dates[i]);
    const v = vals[i] == null ? (r?.closed ? '公休' : '未填') : fmt(k, vals[i]);
    $('#readout').innerHTML = `${md(dates[i])} 週${WD[weekday(dates[i])]}<b>${v}</b>${bases[i] != null ? `常態 ${fmt(k, bases[i])}` : ''}`;
  };
  read(lastI ?? dates.length - 1);
  const guide = $('#guide'), dot = $('#dot');
  const move = e => {
    const rc = svg.getBoundingClientRect(), px = (e.clientX - rc.left) * (W / rc.width);
    const i = Math.max(0, Math.min(dates.length - 1, Math.round((px - L) / (W - L - R) * (dates.length - 1))));
    guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', '1');
    if (vals[i] != null) { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i])); dot.setAttribute('opacity', '1'); } else dot.setAttribute('opacity', '0');
    read(i);
  };
  const hit = $('#hit');
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { guide.setAttribute('opacity', '0'); if (lastI != null) { dot.setAttribute('cx', x(lastI)); dot.setAttribute('cy', y(vals[lastI])); dot.setAttribute('opacity', '1'); } read(lastI ?? dates.length - 1); });
}
function niceStep(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
window.addEventListener('resize', () => { if ($('#sheet')?.classList.contains('open')) renderMetric(); });

// ───────────── 每日填報 ─────────────
function renderReport() {
  const d = S.reportDate || S.today;
  const r = S.byDate.get(d) || { closed: false, data: {}, note: '' };
  const groups = [...new Set(FIELDS.filter(f => f.required).map(f => f.group))];
  const fieldHTML = f => `<div class="field"><label for="f_${f.key}">${f.label}${f.hint ? `<span class="hint">${f.hint}</span>` : ''}</label>
    <input id="f_${f.key}" data-key="${f.key}" type="number" inputmode="numeric" min="0" step="${f.unit === 'money' ? 1 : 1}" placeholder="${f.unit === 'money' ? S.store.currency : f.unit}" value="${r.data?.[f.key] ?? ''}"></div>`;
  const strip = Array.from({ length: 14 }, (_, i) => addDays(S.today, -(13 - i))).map(x => {
    const rr = S.byDate.get(x);
    return `<button data-date="${x}" class="${rr ? (rr.closed ? 'closed' : 'filled') : ''}" ${x === d ? 'aria-current="date"' : ''}><i></i>${+x.slice(8, 10)}</button>`;
  }).join('');

  shell('report', '每日填報', `${dateSub(d)} · ${S.byDate.has(d) ? '已填過，可修改' : '尚未填報'}`, `
    <div class="datebar">
      <button class="btn" id="prevD" aria-label="前一天">‹</button>
      <input type="date" id="rDate" value="${d}" max="${S.today}">
      <button class="btn" id="nextD" aria-label="後一天" ${d >= S.today ? 'disabled' : ''}>›</button>
    </div>
    <div class="strip" aria-label="近 14 天填報狀況">${strip}</div>
    <p class="small dim" style="margin:6px 0 0">藍色＝已填、灰色＝公休、空心＝未填</p>

    <label class="toggle"><span>今日公休／不列入計算<span class="hint small dim" style="display:block">活動日、連假等特殊日子也可勾選</span></span><input type="checkbox" id="closed" ${r.closed ? 'checked' : ''}></label>

    <div id="numFields" ${r.closed ? 'hidden' : ''}>
      ${groups.map(g => `<div class="form-group"><h3>${g}</h3><div class="fields">${FIELDS.filter(f => f.required && f.group === g).map(fieldHTML).join('')}</div></div>`).join('')}
      <details class="more" ${FIELDS.some(f => !f.required && r.data?.[f.key] != null && r.data[f.key] !== '') ? 'open' : ''}>
        <summary>＋ 選填欄位（${FIELDS.filter(f => !f.required).length} 項）</summary>
        <div class="fields" style="margin-top:8px">${FIELDS.filter(f => !f.required).map(fieldHTML).join('')}</div>
      </details>
      <div class="summary" id="liveSum"></div>
    </div>
    <div class="stack"><label for="note">備註／明日最重要的事</label><textarea id="note" placeholder="例：週六成果發表彩排；明天先回訪 3 位體驗家長">${esc(r.note || '')}</textarea></div>
    <div style="height:70px"></div>
    <div class="savebar"><div class="in"><button class="btn primary block" id="saveR">儲存 ${md(d)} 的數字</button></div></div>
  `);

  const go = nd => { if (nd > S.today) return; S.reportDate = nd; renderReport(); };
  $('#rDate').onchange = e => e.target.value && go(e.target.value);
  $('#prevD').onclick = () => go(addDays(d, -1));
  $('#nextD').onclick = () => go(addDays(d, 1));
  document.querySelectorAll('[data-date]').forEach(el => el.onclick = () => go(el.dataset.date));
  $('#closed').onchange = e => { $('#numFields').hidden = e.target.checked; };

  const collect = () => {
    const data = {};
    document.querySelectorAll('[data-key]').forEach(i => { if (i.value !== '') data[i.dataset.key] = Math.max(0, Number(i.value)); });
    return data;
  };
  const live = () => {
    const data = collect();
    $('#liveSum').innerHTML = `
      <div><div class="k">實收合計</div><div class="v">${money(METRICS.revenue.calc(data))}</div></div>
      <div><div class="k">班均</div><div class="v">${METRICS.classAvg.calc(data)?.toFixed(1) ?? '—'}</div></div>
      <div><div class="k">必填已填</div><div class="v">${REQUIRED_KEYS.filter(k => data[k] != null).length}/${REQUIRED_KEYS.length}</div></div>`;
  };
  document.querySelectorAll('[data-key]').forEach(i => i.oninput = live);
  live();

  $('#saveR').onclick = async e => {
    const closed = $('#closed').checked, data = closed ? {} : collect();
    if (!closed) {
      const miss = REQUIRED_KEYS.filter(k => data[k] == null);
      if (miss.length && !confirm(`還有 ${miss.length} 個必填欄位空白，空白會當作 0。確定儲存？`)) return;
      REQUIRED_KEYS.forEach(k => { if (data[k] == null) data[k] = 0; });
      if (data.trials > data.invites + 2) toast('提醒：試課人數比邀約多，請確認');
    }
    e.target.disabled = true;
    try {
      const row = { closed, data, note: $('#note').value.trim() };
      await api.saveReport(S.store.id, d, row);
      S.byDate.set(d, { report_date: d, ...row });
      toast('已儲存');
      renderReport();
    } catch (err) { alert('儲存失敗：' + err.message); e.target.disabled = false; }
  };
}

// ───────────── 事件登記 ─────────────
const byDue = (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999');
function eventList(list, compact) {
  if (!list.length) return `<div class="empty-box">${compact ? '沒有進行中的事件。' : '這裡沒有事件。'}</div>`;
  return `<div class="list">${list.map(e => {
    const overdue = e.status === 'open' && e.due_date && e.due_date <= S.today;
    const st = e.status === 'done' ? '<span class="tag t-good">已結案</span>' : e.status === 'dropped' ? '<span class="tag t-none">放棄</span>' : '';
    return `<div class="row" data-ev="${e.id}">
      <div class="row-main"><div class="nm">${esc(e.student_name)} <span class="tag t-accent">${KIND_LABEL[e.kind]}</span>${st}</div>
        ${e.reason ? `<div class="sub">${esc(e.reason)}</div>` : ''}
        ${e.result ? `<div class="sub" style="color:var(--good)">結果：${esc(e.result)}</div>` : ''}
        ${!compact && e.status === 'open' ? `<div class="acts" style="margin-top:8px"><button class="btn primary" data-close="${e.id}" data-st="done">結案，記結果</button><button class="btn" data-close="${e.id}" data-st="dropped">放棄</button><button class="btn" data-snooze="${e.id}">延 2 天</button></div>` : ''}
      </div>
      <div class="row-right">${e.due_date ? `<span style="${overdue ? 'color:var(--warn)' : ''}">${overdue ? '到期 ' : ''}${md(e.due_date)}</span>` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}
function bindEventRows() {
  document.querySelectorAll('[data-close]').forEach(el => el.onclick = async () => {
    const r = prompt(el.dataset.st === 'done' ? '處理結果？（例：已續約、轉週六班）' : '放棄原因？', '');
    if (r === null) return;
    const patch = { status: el.dataset.st, result: r.trim() || (el.dataset.st === 'done' ? '已處理' : '放棄'), closed_at: new Date().toISOString() };
    await api.updateEvent(el.dataset.close, patch);
    Object.assign(S.events.find(e => e.id === el.dataset.close), patch);
    toast('已更新'); renderEvents();
  });
  document.querySelectorAll('[data-snooze]').forEach(el => el.onclick = async () => {
    const ev = S.events.find(e => e.id === el.dataset.snooze);
    const due = addDays(ev.due_date && ev.due_date > S.today ? ev.due_date : S.today, 2);
    await api.updateEvent(ev.id, { due_date: due }); ev.due_date = due;
    toast(`延到 ${md(due)}`); renderEvents();
  });
}

function renderEvents() {
  const open = S.events.filter(e => e.status === 'open');
  const list = (S.eventFilter === 'open' ? open : S.eventFilter === 'closed' ? S.events.filter(e => e.status !== 'open') : S.events);
  const sorted = S.eventFilter === 'open' ? [...list].sort(byDue) : list;
  const closedN = S.events.filter(e => e.status !== 'open').length;
  shell('events', '事件登記', `進行中 ${open.length} 件 · 已結案 ${closedN} 件`, `
    <details class="more" ${S.events.length ? '' : 'open'} id="addBox">
      <summary>＋ 新增事件</summary>
      <form class="card" id="evForm" style="margin-top:8px">
        <div class="stack" style="margin-top:0"><label for="evName">學生姓名</label><input id="evName" required maxlength="40" placeholder="例：陳小語"></div>
        <div class="stack"><label for="evKind">類型</label><select id="evKind">${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="stack"><label for="evReason">原因／狀況</label><textarea id="evReason" maxlength="300" placeholder="例：媽媽說要跟爸爸討論，覺得價格偏高"></textarea></div>
        <div class="stack"><label for="evDue">追蹤期限</label><input id="evDue" type="date" value="${addDays(S.today, 1)}"></div>
        <button class="btn primary block" style="margin-top:14px">新增</button>
      </form>
    </details>
    <div class="chips">${[['open', '進行中'], ['closed', '已結案'], ['all', '全部']].map(([k, l]) => `<button class="chip" data-ef="${k}" aria-pressed="${S.eventFilter === k}">${l}</button>`).join('')}</div>
    <div style="margin-top:10px">${eventList(sorted, false)}</div>
    <p class="small dim">每一筆都要有結果才算閉環。到期未結案的事件，會自動排進首頁的「今日三件事」。</p>
  `);
  document.querySelectorAll('[data-ef]').forEach(el => el.onclick = () => { S.eventFilter = el.dataset.ef; renderEvents(); });
  $('#evForm').onsubmit = async e => {
    e.preventDefault();
    const row = { student_name: $('#evName').value.trim(), kind: $('#evKind').value, reason: $('#evReason').value.trim() || null, due_date: $('#evDue').value || null };
    if (!row.student_name) return;
    (e.submitter || e.target.querySelector('button')).disabled = true;
    try {
      await api.addEvent(S.store.id, row);
      S.events = await api.events(S.store.id);
      S.eventFilter = 'open'; toast('已新增'); renderEvents();
    } catch (err) { alert('新增失敗：' + err.message); (e.submitter || e.target.querySelector('button')).disabled = false; }
  };
  bindEventRows();
}

// ───────────── 月目標 ─────────────
function renderTargets() {
  const d = S.today, t = currentTarget(S.targets, d);
  const month = `${+d.slice(5, 7)} 月`;
  const prog = t ? TARGET_FIELDS.filter(f => Number(t.targets?.[f.key])).map(f => {
    const key = f.key === 'revenue' ? 'revenue' : f.key === 'consume' ? 'consume' : f.key;
    const p = monthProgress(S.byDate, d, t, key);
    const show = v => f.unit === 'money' ? money(v) : Math.round(v);
    return `<div class="card" style="margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>${f.label.replace('目標', '')}</span><span class="tag t-${p.tone}">${pct(p.pct)}</span></div>
      <div style="margin-top:2px"><span class="prog-big" style="font-size:22px">${show(p.mtd)}</span><span class="small dim"> / ${show(p.goal)}</span></div>
      <div class="bar"><span style="width:${Math.min(100, (p.pct || 0) * 100).toFixed(1)}%"></span><i class="pace" style="left:calc(${(p.pace * 100).toFixed(1)}% - 1px)"></i></div>
      <div class="small muted" style="margin-top:8px">剩 ${p.remain} 天，每天需 ${show(p.needPerDay)}</div></div>`;
  }).join('') : '';

  shell('targets', `${month}目標`, t ? `目前生效：${md(t.effective_from)} 起` : '尚未設定', `
    ${prog || `<div class="empty-box" style="margin-top:14px">還沒有本月目標，先在下面設定。</div>`}
    <div class="sec-head"><h2>${t ? '調整目標' : '設定目標'}</h2><span class="meta">每次修改都會留紀錄</span></div>
    <form class="card" id="tgForm">
      ${TARGET_FIELDS.map(f => `<div class="stack" style="margin-top:${f.key === 'revenue' ? 0 : 12}px"><label for="tg_${f.key}">${f.label}（${f.unit === 'money' ? S.store.currency : f.unit}）</label>
        <input id="tg_${f.key}" data-tk="${f.key}" type="number" inputmode="numeric" min="0" value="${t?.targets?.[f.key] ?? ''}"></div>`).join('')}
      <div class="stack"><label for="tgFrom">從哪天起生效</label><input id="tgFrom" type="date" value="${d}" min="${monthStart(d)}" max="${addDays(monthStart(d), daysInMonth(d) - 1)}"></div>
      <div class="stack"><label for="tgWhy">調整原因</label><input id="tgWhy" maxlength="100" placeholder="例：月中加開暑期班"></div>
      <button class="btn primary block" style="margin-top:14px">儲存目標</button>
    </form>
    ${S.targets.length ? `<div class="sec-head"><h2>修改紀錄</h2></div><div class="list">${[...S.targets].reverse().map(x => `
      <div class="row"><div class="row-main"><div class="nm">${md(x.effective_from)} 起</div>
        <div class="sub">${TARGET_FIELDS.filter(f => x.targets?.[f.key] != null && x.targets[f.key] !== '').map(f => `${f.label.replace('目標', '')} ${f.unit === 'money' ? money(x.targets[f.key]) : x.targets[f.key]}`).join('　')}</div>
        ${x.reason ? `<div class="sub dim">${esc(x.reason)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
    <p class="small dim">目標浮動時，進度會從生效日起用新目標計算；「每天需要多少」也會跟著重算。</p>
  `);
  $('#tgForm').onsubmit = async e => {
    e.preventDefault();
    const targets = {};
    document.querySelectorAll('[data-tk]').forEach(i => { if (i.value !== '') targets[i.dataset.tk] = Number(i.value); });
    if (!Object.keys(targets).length) return alert('至少填一個目標');
    (e.submitter || e.target.querySelector('button')).disabled = true;
    try {
      await api.addTarget(S.store.id, { month: monthStart(d), effective_from: $('#tgFrom').value || d, targets, reason: $('#tgWhy').value.trim() || null });
      S.targets = await api.targets(S.store.id, monthStart(d));
      toast('目標已更新'); renderTargets();
    } catch (err) { alert('儲存失敗：' + err.message); (e.submitter || e.target.querySelector('button')).disabled = false; }
  };
}

boot().catch(err => { $('#app').innerHTML = `<div class="login"><h1>載入失敗</h1><p class="muted">${esc(err.message)}</p></div>`; console.error(err); });
