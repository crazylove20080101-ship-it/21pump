// 指標定義與計算：欄位、常態值（截尾平均）、燈號、今日三件事規則。
// 這個檔案不碰畫面也不碰資料庫，方便之後調整規則。

// ───────────── 每日填報欄位 ─────────────
// key 存進 daily_reports.data；required=false 的欄位預設收合。
export const FIELDS = [
  { key: 'new_amt',    label: '新客成交金額', unit: 'money', group: '營收', required: true },
  { key: 'renew_amt',  label: '續費金額',     unit: 'money', group: '營收', required: true },
  { key: 'other_amt',  label: '其他銷售',     unit: 'money', group: '營收', required: true, hint: '商品、活動、集訓' },
  { key: 'refund_amt', label: '退款金額',     unit: 'money', group: '營收', required: true },
  { key: 'consume_amt',label: '耗課金額',     unit: 'money', group: '營收', required: true, hint: '已上完、已核銷課程對應的金額' },
  { key: 'leads',      label: '新增有效線索', unit: '人', group: '招生', required: true },
  { key: 'invites',    label: '成功邀約',     unit: '人', group: '招生', required: true, hint: '已確認體驗日期時間' },
  { key: 'trials',     label: '實際試課',     unit: '人', group: '招生', required: true },
  { key: 'deals',      label: '新生成交',     unit: '人', group: '招生', required: true },
  { key: 'renews',     label: '續費人數',     unit: '人', group: '會員與上課', required: true },
  { key: 'churn',      label: '流失人數',     unit: '人', group: '會員與上課', required: true, hint: '確認停止學習' },
  { key: 'classes',    label: '開課班次',     unit: '班', group: '會員與上課', required: true },
  { key: 'attend',     label: '實到人次',     unit: '人次', group: '會員與上課', required: true },
  // 選填
  { key: 'contacts',   label: '有效聯繫',     unit: '人', group: '選填', required: false, hint: '完成雙向溝通' },
  { key: 'activities', label: '招生活動量',   unit: '次', group: '選填', required: false, hint: '地推、校園合作、拜訪' },
  { key: 'refunds',    label: '退費人數',     unit: '人', group: '選填', required: false },
  { key: 'saved',      label: '挽回成功',     unit: '人', group: '選填', required: false },
  { key: 'care',       label: '有效關懷',     unit: '人', group: '選填', required: false },
  { key: 'learn_issue',label: '學習異常',     unit: '人', group: '選填', required: false, hint: '抗拒上課、進度落後、適應不良' },
];
export const REQUIRED_KEYS = FIELDS.filter(f => f.required).map(f => f.key);

// 月目標欄位
export const TARGET_FIELDS = [
  { key: 'revenue', label: '實收目標', unit: 'money' },
  { key: 'consume', label: '耗課目標', unit: 'money' },
  { key: 'deals',   label: '新生目標', unit: '人' },
  { key: 'leads',   label: '線索目標', unit: '人' },
];

// ───────────── 指標：每日可算出的數值 ─────────────
// better: 'up' 越高越好；'down' 越低越好
const n = (d, k) => Number(d?.[k]) || 0;
export const METRICS = {
  revenue:  { label: '今日實收', unit: 'money', better: 'up',   calc: d => n(d,'new_amt') + n(d,'renew_amt') + n(d,'other_amt') },
  consume:  { label: '耗課金額', unit: 'money', better: 'up',   calc: d => n(d,'consume_amt') },
  leads:    { label: '新增線索', unit: '人',    better: 'up',   calc: d => n(d,'leads') },
  invites:  { label: '成功邀約', unit: '人',    better: 'up',   calc: d => n(d,'invites') },
  trials:   { label: '實際試課', unit: '人',    better: 'up',   calc: d => n(d,'trials') },
  deals:    { label: '新生成交', unit: '人',    better: 'up',   calc: d => n(d,'deals') },
  renews:   { label: '續費人數', unit: '人',    better: 'up',   calc: d => n(d,'renews') },
  attend:   { label: '實到人次', unit: '人次',  better: 'up',   calc: d => n(d,'attend') },
  classAvg: { label: '班均',     unit: '人',    better: 'up',   calc: d => n(d,'classes') ? n(d,'attend') / n(d,'classes') : null, decimals: 1 },
  refund:   { label: '退款金額', unit: 'money', better: 'down', calc: d => n(d,'refund_amt') },
  churn:    { label: '流失人數', unit: '人',    better: 'down', calc: d => n(d,'churn') },
};

// ───────────── 日期工具（以台北時間為準） ─────────────
export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}
export function addDays(s, k) {
  const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}
export const weekday = s => new Date(s + 'T00:00:00Z').getUTCDay();
export const daysInMonth = s => new Date(Date.UTC(+s.slice(0,4), +s.slice(5,7), 0)).getUTCDate();
export const monthStart = s => s.slice(0, 8) + '01';

// ───────────── 常態值：截尾平均 ─────────────
// 規則：取最近 6 個「同星期幾」且非公休的日子，去掉最高與最低各一，剩下平均。
// 同星期幾不足 5 筆時，退而用最近 14 個開店日（同樣截尾）。
// 再不足 5 筆 → null（畫面顯示「累積中」）。
export const BASELINE = { sameWeekday: 6, recentDays: 14, minSamples: 5 };

export function trimmedMean(vals) {
  if (vals.length < BASELINE.minSamples) return null;
  const s = [...vals].sort((a, b) => a - b).slice(1, -1);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

// byDate: Map(date → report)；只看 date 之前的資料
export function baseline(metricKey, date, byDate) {
  const calc = METRICS[metricKey].calc;
  const wd = weekday(date);
  const same = [], recent = [];
  for (let i = 1; i <= 7 * 12 && (same.length < BASELINE.sameWeekday || recent.length < BASELINE.recentDays); i++) {
    const d = addDays(date, -i), r = byDate.get(d);
    if (!r || r.closed) continue;
    const v = calc(r.data);
    if (v == null) continue;
    if (recent.length < BASELINE.recentDays) recent.push(v);
    if (weekday(d) === wd && same.length < BASELINE.sameWeekday) same.push(v);
  }
  const a = trimmedMean(same);
  if (a != null) return { value: a, basis: `近 ${same.length} 個週${'日一二三四五六'[wd]}` };
  const b = trimmedMean(recent);
  if (b != null) return { value: b, basis: `近 ${recent.length} 個開店日` };
  return { value: null, basis: `累積中（${Math.max(same.length, recent.length)}/${BASELINE.minSamples}）` };
}

// 與常態比較的燈號：±15% 內正常
export function vsBaseline(metricKey, value, base) {
  if (value == null) return { tone: 'none', label: '未填', pct: null };
  if (base == null) return { tone: 'none', label: '累積中', pct: null };
  if (base === 0) return value === 0 ? { tone: 'ok', label: '正常', pct: 0 } : { tone: 'good', label: '高於常態', pct: null };
  const pct = (value - base) / base;
  // 人數類指標量小，差不到 2 人一律算正常，避免 1 人 vs 2 人就亮紅燈
  const m = METRICS[metricKey];
  if (m.unit !== 'money' && !m.decimals && Math.abs(value - base) < 2) return { tone: 'ok', label: '正常', pct };
  const sign = METRICS[metricKey].better === 'down' ? -1 : 1;
  const p = pct * sign;
  if (p <= -0.3) return { tone: 'bad', label: '明顯偏低', pct };
  if (p <= -0.15) return { tone: 'warn', label: '偏低', pct };
  if (p >= 0.15) return { tone: 'good', label: '高於常態', pct };
  return { tone: 'ok', label: '正常', pct };
}
// better=down 時「偏低」字樣要反過來
export function toneLabel(metricKey, v) {
  if (METRICS[metricKey].better !== 'down' || v.tone === 'none' || v.tone === 'ok') return v.label;
  return { bad: '明顯偏高', warn: '偏高', good: '低於常態' }[v.tone];
}

// ───────────── 期間加總與比率（比率一律用加總後再除） ─────────────
export function sumRange(byDate, from, to, key) {
  let s = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const r = byDate.get(d); if (r) s += Number(r.data?.[key]) || 0; }
  return s;
}
export function sumMetric(byDate, from, to, metricKey) {
  let s = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const r = byDate.get(d); if (r) s += METRICS[metricKey].calc(r.data) || 0; }
  return s;
}

// 手冊門檻：to=到店率、close=試課成交率
export const RATE_RULES = {
  show:  { label: '試課到店率', num: 'trials', den: 'invites', red: 0.70, green: 0.85 },
  close: { label: '試課成交率', num: 'deals',  den: 'trials',  red: 0.40, green: 0.60 },
  invite:{ label: '線索邀約率', num: 'invites',den: 'leads',   red: null, green: null },
};
export function rate(byDate, to, ruleKey, days = 7) {
  const r = RATE_RULES[ruleKey], from = addDays(to, -(days - 1));
  const num = sumRange(byDate, from, to, r.num), den = sumRange(byDate, from, to, r.den);
  const value = den ? num / den : null;
  let tone = 'none';
  if (value != null && r.red != null) tone = value < r.red ? 'bad' : value < r.green ? 'warn' : 'good';
  return { value, num, den, tone, label: r.label };
}

// ───────────── 月進度 ─────────────
// targets: monthly_targets 該月所有紀錄（effective_from 由舊到新）
export function currentTarget(targets, date) {
  let cur = null;
  for (const t of targets) if (t.effective_from <= date) cur = t;
  return cur || targets[0] || null;
}
export function monthProgress(byDate, date, target, metricKey) {
  const ms = monthStart(date), dim = daysInMonth(date), day = +date.slice(8, 10);
  const mtd = sumMetric(byDate, ms, date, metricKey);
  const goal = target ? Number(target.targets?.[metricKey]) || 0 : 0;
  const pace = day / dim;
  const pct = goal ? mtd / goal : null;
  const remain = dim - day;
  const needPerDay = goal && remain > 0 ? Math.max(0, (goal - mtd) / remain) : 0;
  const projected = mtd / day * dim;
  // 手冊：達成率 / 時間進度 ≥100% 綠、80–99% 黃、<80% 紅
  let tone = 'none';
  if (pct != null) { const r = pct / pace; tone = r >= 1 ? 'good' : r >= 0.8 ? 'warn' : 'bad'; }
  return { mtd, goal, pace, pct, needPerDay, projected, remain, day, dim, tone };
}

// ───────────── 今日三件事 ─────────────
// 依優先序產生候選，取前 3。每條規則回傳 {key, tag, tone, title, why}。
export function buildTasks({ date, byDate, targets, events, cur }) {
  const out = [];
  const money = v => cur + Math.round(v).toLocaleString('en-US');

  // 1. 逾期事件
  const overdue = events.filter(e => e.status === 'open' && e.due_date && e.due_date <= date)
                        .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (overdue.length) {
    const names = overdue.slice(0, 3).map(e => e.student_name).join('、');
    out.push({ key: 'overdue_events', tag: '事件到期', tone: 'warn', prio: 100,
      title: overdue.length === 1 ? `${names}：${KIND_LABEL[overdue[0].kind]}，今天到期` : `${overdue.length} 件事件已到期：${names}${overdue.length > 3 ? ' 等' : ''}`,
      why: '每一筆事件都要有結果才算閉環。拖過期限，家長的決定通常已經定了。', link: '#/events' });
  }

  // 2. 試課成交率
  const close = rate(byDate, date, 'close');
  if (close.den >= 3 && close.tone === 'bad') {
    out.push({ key: 'close_rate', tag: '成交偏低', tone: 'warn', prio: 80,
      title: `近 7 天試課 ${close.den} 人只成交 ${close.num} 人（${pct(close.value)}），逐一標記未成交原因`,
      why: '到店多、成交少，通常是體驗品質、需求診斷或方案呈現的問題。24 小時內二次跟進最有效。' });
  }

  // 3. 試課到店率
  const show = rate(byDate, date, 'show');
  if (show.den >= 3 && show.tone === 'bad') {
    out.push({ key: 'show_rate', tag: '到店偏低', tone: 'warn', prio: 75,
      title: `近 7 天邀約 ${show.den} 人只到 ${show.num} 人（${pct(show.value)}），檢查試課前提醒`,
      why: '爽約多代表確認機制弱。試課前一天＋前 2 小時雙提醒，爽約 24 小時內重約。' });
  }

  // 4. 月實收落後
  const t = currentTarget(targets, date);
  if (t && Number(t.targets?.revenue)) {
    const p = monthProgress(byDate, date, t, 'revenue');
    if (p.tone === 'bad' || p.tone === 'warn') {
      out.push({ key: 'revenue_pace', tag: '業績落後', tone: p.tone === 'bad' ? 'warn' : 'accent', prio: p.tone === 'bad' ? 70 : 40,
        title: `本月實收落後進度 ${Math.round((p.pace - p.pct) * 100)}%，剩 ${p.remain} 天每天需 ${money(p.needPerDay)}`,
        why: '先拆缺口：是新簽不足、續費不足，還是活動收入沒進來？只追最大的那一塊。' });
    }
  }

  // 5. 線索連續 3 天低於常態
  let lowDays = 0;
  for (let i = 0; i < 3; i++) {
    const d = addDays(date, -i), r = byDate.get(d);
    if (!r || r.closed) break;
    const b = baseline('leads', d, byDate);
    if (b.value == null || METRICS.leads.calc(r.data) >= b.value * 0.85) break;
    lowDays++;
  }
  if (lowDays === 3) {
    out.push({ key: 'leads_low', tag: '線索不足', tone: 'accent', prio: 60,
      title: '新增線索連續 3 天低於常態，今天補一個招生動作',
      why: '沒有線索，後面的邀約和成交一定斷層。地推、私域或合作渠道，挑一個今天做。' });
  }

  // 6. 本週淨增為負
  const from = addDays(date, -6);
  const net = sumRange(byDate, from, date, 'deals') - sumRange(byDate, from, date, 'churn');
  if (net < 0) {
    out.push({ key: 'net_negative', tag: '會員淨減', tone: 'warn', prio: 55,
      title: `近 7 天新生 ${sumRange(byDate, from, date, 'deals')} 人、流失 ${sumRange(byDate, from, date, 'churn')} 人，會員在減少`,
      why: '不能只要求招生，要同時看流失原因。把流失的學生登記成事件，寫下原因。', link: '#/events' });
  }

  // 7. 今天還沒填報
  const today = byDate.get(date);
  if (!today) {
    out.push({ key: 'fill_report', tag: '每日填報', tone: 'accent', prio: 30,
      title: '今天的數字還沒填', why: '每天的數字是常態值和燈號的基礎，資料越完整，判斷越準。', link: '#/report', noLog: true });
  }

  return out.sort((a, b) => b.prio - a.prio).slice(0, 3);
}

export const KIND_LABEL = {
  trial_lost: '試課未成交', absence: '缺席／請假', renew_refused: '拒絕續費', complaint: '客訴／異常', other: '其他',
};
export const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
