// 資料存取層。config.js 有填 Supabase 就連線上資料庫；
// 沒填就進「示範模式」，資料存在這台瀏覽器（localStorage），方便先看畫面。
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { addDays, todayStr, weekday, monthStart } from './metrics.js';

export const DEMO = !SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT');

let api;
if (DEMO) api = demoApi();
else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  api = supabaseApi(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
}
export default api;

// ───────────── Supabase ─────────────
function supabaseApi(sb) {
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const uid = async () => (await sb.auth.getUser()).data.user?.id;
  return {
    async session() { return (await sb.auth.getSession()).data.session; },
    onAuth(fn) { sb.auth.onAuthStateChange((_e, s) => fn(s)); },
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new Error(error.message === 'Invalid login credentials' ? '帳號或密碼錯誤' : error.message); },
    async signOut() { await sb.auth.signOut(); },
    async profile() {
      // admin 讀得到所有人的 profile，所以一定要用自己的 user_id 篩選
      const p = must(await sb.from('profiles').select('role, display_name, store_id, stores(id, name, currency)').eq('user_id', await uid()).maybeSingle());
      if (!p) return null;
      return { role: p.role, name: p.display_name, store: p.stores };
    },
    async reports(storeId, from, to) {
      return must(await sb.from('daily_reports').select('report_date, closed, data, note, updated_at')
        .eq('store_id', storeId).gte('report_date', from).lte('report_date', to).order('report_date'));
    },
    async saveReport(storeId, date, { closed, data, note }) {
      must(await sb.from('daily_reports').upsert({ store_id: storeId, report_date: date, closed, data, note, updated_by: await uid(), updated_at: new Date().toISOString() }));
    },
    async targets(storeId, month) {
      return must(await sb.from('monthly_targets').select('*').eq('store_id', storeId).eq('month', month).order('effective_from').order('id'));
    },
    async addTarget(storeId, row) {
      must(await sb.from('monthly_targets').insert({ store_id: storeId, ...row, created_by: await uid() }));
    },
    async events(storeId) {
      return must(await sb.from('events').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(300));
    },
    async addEvent(storeId, row) {
      must(await sb.from('events').insert({ store_id: storeId, ...row, created_by: await uid() }));
    },
    async updateEvent(id, patch) { must(await sb.from('events').update(patch).eq('id', id)); },
    async taskLogs(storeId, date) {
      return must(await sb.from('task_logs').select('*').eq('store_id', storeId).eq('task_date', date));
    },
    async logTask(storeId, row) {
      must(await sb.from('task_logs').upsert({ store_id: storeId, ...row, created_by: await uid() }, { onConflict: 'store_id,task_date,rule_key' }));
    },
    async unlogTask(storeId, date, ruleKey) {
      must(await sb.from('task_logs').delete().eq('store_id', storeId).eq('task_date', date).eq('rule_key', ruleKey));
    },
  };
}

// ───────────── 示範模式 ─────────────
function demoApi() {
  const KEY = '21pump-demo-v1';
  const STORE = { id: 'demo', name: '台灣店（示範）', currency: 'NT$' };
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch { st = null; }
  if (!st) st = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  save();
  let authFn = () => {};
  const session = () => st.signedIn ? { user: { email: 'demo' } } : null;

  return {
    async session() { return session(); },
    onAuth(fn) { authFn = fn; },
    async signIn() { st.signedIn = true; save(); authFn(session()); },
    async signOut() { st.signedIn = false; save(); authFn(null); },
    async profile() { return { role: 'admin', name: '示範帳號', store: STORE }; },
    async reports(_s, from, to) { return st.reports.filter(r => r.report_date >= from && r.report_date <= to).sort((a, b) => a.report_date.localeCompare(b.report_date)); },
    async saveReport(_s, date, row) {
      st.reports = st.reports.filter(r => r.report_date !== date);
      st.reports.push({ report_date: date, ...row, updated_at: new Date().toISOString() }); save();
    },
    async targets(_s, month) { return st.targets.filter(t => t.month === month).sort((a, b) => a.effective_from.localeCompare(b.effective_from) || a.id - b.id); },
    async addTarget(_s, row) { st.targets.push({ id: Date.now(), created_at: new Date().toISOString(), ...row }); save(); },
    async events() { return [...st.events].sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async addEvent(_s, row) { st.events.push({ id: crypto.randomUUID(), status: 'open', created_at: new Date().toISOString(), ...row }); save(); },
    async updateEvent(id, patch) { Object.assign(st.events.find(e => e.id === id), patch); save(); },
    async taskLogs(_s, date) { return st.taskLogs.filter(t => t.task_date === date); },
    async logTask(_s, row) { st.taskLogs = st.taskLogs.filter(t => !(t.task_date === row.task_date && t.rule_key === row.rule_key)); st.taskLogs.push(row); save(); },
    async unlogTask(_s, date, key) { st.taskLogs = st.taskLogs.filter(t => !(t.task_date === date && t.rule_key === key)); save(); },
    resetDemo() { localStorage.removeItem(KEY); location.reload(); },
  };

  // 產生 40 天的虛構資料（今天留空，讓人試填）
  function seed() {
    let a = 20261104;
    const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const today = todayStr();
    const WK = [1.5, 0.5, 0.8, 0.9, 0.85, 1.0, 1.9]; // 日一二三四五六
    const reports = [];
    for (let i = 40; i >= 1; i--) {
      const d = addDays(today, -i), w = WK[weekday(d)];
      if (weekday(d) === 1 && i % 14 === 0) { reports.push({ report_date: d, closed: true, data: {}, note: '公休' }); continue; }
      const j = () => 0.7 + rnd() * 0.6, k = (base) => Math.max(0, Math.round(base * w * j()));
      const leads = k(5), invites = Math.min(leads, k(3)), trials = Math.min(invites, Math.round(invites * (0.6 + rnd() * 0.35)));
      const deals = Math.min(trials, Math.round(trials * (0.3 + rnd() * 0.4)));
      const classes = Math.max(1, Math.round(6 * w)), attend = Math.round(classes * (6 + rnd() * 4));
      const data = {
        new_amt: deals * Math.round(8000 + rnd() * 6000), renew_amt: k(1.2) * 12000, other_amt: rnd() < 0.3 ? Math.round(rnd() * 5000 / 100) * 100 : 0,
        refund_amt: rnd() < 0.08 ? 6000 : 0, consume_amt: Math.round(attend * 420 * j() / 10) * 10,
        leads, invites, trials, deals, renews: k(1.2), churn: rnd() < 0.15 ? 1 : 0, classes, attend,
      };
      reports.push({ report_date: d, closed: false, data, note: '' });
    }
    return {
      signedIn: false, reports, taskLogs: [],
      targets: [{ id: 1, month: monthStart(today), effective_from: monthStart(today), targets: { revenue: 900000, consume: 650000, deals: 30, leads: 140 }, reason: '月初設定', created_at: new Date().toISOString() }],
      events: [
        { id: 'e1', student_name: '陳小語', kind: 'trial_lost', reason: '媽媽說要跟爸爸討論', due_date: today, status: 'open', created_at: addDays(today, -2) + 'T10:00:00Z' },
        { id: 'e2', student_name: '林小安', kind: 'absence', reason: '連續 2 週請假，說身體不舒服', due_date: addDays(today, 1), status: 'open', created_at: addDays(today, -1) + 'T10:00:00Z' },
        { id: 'e3', student_name: '黃以晴', kind: 'renew_refused', reason: '覺得時段不好接送', due_date: addDays(today, -3), status: 'done', result: '轉到週六班，已續約', created_at: addDays(today, -6) + 'T10:00:00Z', closed_at: addDays(today, -3) + 'T10:00:00Z' },
      ],
    };
  }
}
