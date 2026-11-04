// 由 GitHub Actions 執行：官方來源 + 報價(Yahoo) + Gemini(含Google搜尋) 整理事件，累積寫入 data/report.json
import fs from 'node:fs';

const KEY = process.env.GEMINI_KEY, DAYS = +(process.env.DAYS || 1);
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash', MAXCALLS = +(process.env.AI_MAX_CALLS || 30);
const FALLBACK = process.env.GEMINI_FALLBACK ?? 'gemini-2.5-flash-lite';   // 主要模型連續過載時改用；設為空字串可停用
if (!KEY) { console.error('缺少 GEMINI_KEY'); process.exit(1); }
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const T = rd('tickers.json', []);
const old = rd('data/report.json', { reg: [], co: [], quotes: {}, deep: [] });
const TZ = 'Asia/Taipei';
const ymd = t => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ }).replace(/-/g, '/');
const today = ymd(Date.now()), from = ymd(Date.now() - DAYS * 864e5), keep = ymd(Date.now() - 400 * 864e5);
const okd = d => /^\d{4}\/\d{2}\/\d{2}$/.test(d || '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KINDS = ['臨床', '核准', '財報', '併購', '法規', '訴訟', '合作', '產能', '其他'];
const nImp = x => { const n = Math.round(+x); return n >= 1 && n <= 5 ? n : 3; };
const nKind = k => KINDS.includes(k) ? k : '其他';

// ---------- Gemini ----------
let calls = 0;
function extract(t) {
  const i = t.search(/[\[{]/); if (i < 0) return null;
  let depth = 0, str = false, esc = false;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { if (--depth === 0) return t.slice(i, j + 1); }
  }
  return null;
}
async function gem(prompt, search = true) {
  if (calls >= MAXCALLS) { console.error('已達 AI 呼叫上限', MAXCALLS); return null; }
  calls++;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${(i >= 1 && FALLBACK) ? FALLBACK : MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 }, ...(search ? { tools: [{ google_search: {} }] } : {}) })
    });
    if (r.status === 429 || r.status >= 500) { console.error('Gemini 暫時失敗 HTTP', r.status, `，${20 * (i + 1)} 秒後重試${i === 0 && FALLBACK ? '（改用備援模型 ' + FALLBACK + '）' : ''}`); await sleep(20000 * (i + 1)); continue; }
    const j = await r.json();
    if (!r.ok) { console.error('Gemini 錯誤 HTTP', r.status, j.error?.message || ''); return null; }
    const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/```json|```/g, '').trim();
    try { return JSON.parse(extract(t)); } catch { /* retry */ }
  }
  console.error('Gemini 連續失敗，這一批略過');
  return null;
}
async function pool(fns, n = 2) { const o = []; for (let i = 0; i < fns.length; i += n) o.push(...await Promise.all(fns.slice(i, i + n).map(f => f()))); return o; }

// ---------- 官方來源 RSS / Atom ----------
const FEEDS = [
  { n: 'FDA 新聞稿', org: 'FDA', u: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml' },
  { n: 'FDA 藥品最新消息', org: 'FDA', u: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/drugs/rss.xml' },
  { n: 'FDA 生物製劑', org: 'FDA', u: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/biologics/rss.xml' },
  { n: 'EMA 人用藥品重點', org: 'EMA', u: 'https://www.ema.europa.eu/en/human-medicine-highlights-newsletter.xml' },
  { n: 'MHRA', org: 'MHRA', u: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency.atom' }
];
const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
const clean = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/\s+/g, ' ').trim();
function parseFeed(x) {
  return (x.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []).map(it => ({
    t: clean(tag(it, 'title')),
    l: (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || clean(tag(it, 'link')),
    d: Date.parse(clean(tag(it, 'pubDate') || tag(it, 'updated') || tag(it, 'published') || tag(it, 'dc:date'))) || 0
  }));
}
const srcs = [], offi = [];
for (const f of FEEDS) {
  try {
    const r = await fetch(f.u, { headers: { 'User-Agent': 'Mozilla/5.0 (report-bot)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const l = parseFeed(await r.text()).filter(x => x.t && x.l && x.d && ymd(x.d) >= from);
    srcs.push({ n: f.n, ok: 1, count: l.length });
    l.slice(0, 25).forEach(x => offi.push({ ...x, org: f.org, date: ymd(x.d) }));
  } catch (e) { srcs.push({ n: f.n, ok: 0, err: String(e.message || e).slice(0, 60) }); }
}
console.log('官方來源：', srcs.map(s => `${s.n}:${s.ok ? s.count : '失敗(' + s.err + ')'}`).join('；'));

// ---------- 提示詞 ----------
const recent = [...old.reg.map(x => x.name), ...old.co.map(e => `${e.name || e.sym}:${(e.event || '').slice(0, 20)}`)].slice(-80).join('；') || '無';
const base = `現在時間：${new Date().toLocaleString('zh-TW', { timeZone: TZ, hour12: false })}（台北）。報導區間：${from} ～ ${today}（含）。` +
  '規則：只收錄此區間內實際發生、且已用搜尋找到來源佐證的事件；日期一律 YYYY/MM/DD，無法確認者不得收錄；不可捏造；url 須為實際搜尋到的網址。' +
  '涵蓋美國、歐洲、日本、中國、澳洲、臺灣及其他重要地區當前或前夜最新動態；板塊含生技醫藥、醫療科技(MedTech)、智慧醫療、醫療服務、醫藥通路、健康管理、長壽科技。' +
  `以下事項已收錄，除非有實質新進展，否則不得重複：${recent}。只回傳純 JSON。`;
const IMP = 'imp 為重要性 1–5 的整數（5=足以改變產業格局或明顯影響股價，3=一般，1=次要）。';
const EV = '只輸出區間內有「實質重大進展」的公司，沒有就不要輸出。回傳陣列，每筆 {"sym":"代號(須與提供者一致)","name":"公司","market":"市場","date":"YYYY/MM/DD","kind":"臨床|核准|財報|併購|法規|訴訟|合作|產能|其他","event":"重大進展","catalyst":"後續催化劑與預定日","impact":"市場影響評估一句","imp":3,"url":""}。' + IMP;
const fmt = l => l.map(x => `${x.n}(${x.s})`).join('、');

// 追蹤旗標：ai=1 每次；ai=2 依市場收盤時段每日一次（美=0、亞洲=1、歐=2）；回補(DAYS>1)則全部執行
const h = new Date().getUTCHours(), slot = (h >= 20 || h < 3) ? 0 : h < 10 ? 1 : 2;
const SLOT = { 美: 0, 歐: 2, 日: 1, 中: 1, 臺: 1, 澳: 1 };
const ai = T.filter(t => t.ai && (t.ai === 1 || t.ai === true || DAYS > 1 || (SLOT[t.m] ?? 1) === slot));
const chunks = []; for (let i = 0; i < ai.length; i += 10) chunks.push(ai.slice(i, i + 10));
console.log(`本次時段 ${slot}，AI 追蹤 ${ai.length} 檔，分 ${chunks.length} 批`);

const offList = offi.slice(0, 60).map((x, i) => `[${i}] ${x.org}｜${x.date}｜${x.t}`).join('\n') || '（官方來源本次無可用公告）';
const regPrompt = base + `\n任務：各國藥監機關動態。以下為官方來源近期公告（可信）：\n${offList}\n` +
  '請從中挑出與生技醫藥、醫療器材相關者（新核准、優先審查、政策、規定、審議、安全警訊等），以編號填入 ref；另請搜尋 NMPA、TFDA、PMDA、TGA、Health Canada 及 FDA/EMA 的重大事項（ref 填 null）。' +
  '回傳陣列，最多 25 筆，每筆 {"ref":編號或null,"org":"FDA|EMA|NMPA|TFDA|PMDA|其他","name":"藥品/醫材/政策主題","company":"藥廠/單位","date":"YYYY/MM/DD","indication":"適應症","type":"核准/優先審查/PDUFA/CHMP意見/政策/審議中/安全警訊","value":"商業與臨床價值一句","imp":3,"url":""}。' + IMP;

const dFrom = ymd(Date.now() - Math.max(DAYS, 14) * 864e5);
const DT = ['政策變化', '重大事件', '技術突破'];
const seenDeep = (old.deep || []).filter(x => x.d).slice(-40).map(x => x.title).join('；') || '無';
const deepPrompt = `現在時間：${new Date().toLocaleString('zh-TW', { timeZone: TZ, hour12: false })}（台北）。請搜尋 ${dFrom} ～ ${today} 全球生技醫療產業的：` +
  '(1) 政策變化（法規、審查制度、藥價、醫保、關稅、貿易與出口管制等）；(2) 重大事件（疾病、疫情、產業整合、併購、分拆、聯盟、供應鏈事件等）；(3) 技術突破（新機轉、平台技術、重大臨床或科學突破）。' +
  '規則：只收錄已搜尋到來源佐證的事實，不可捏造；日期一律 YYYY/MM/DD；相關業者若為上市公司，代號用 Yahoo Finance 格式，非上市則 s 填空字串。' +
  `已收錄標題（除非有實質新進展，否則不得重複）：${seenDeep}。回傳陣列，最多 12 筆依重要性排序，每筆 {"type":"政策變化|重大事件|技術突破","title":"標題","d":"YYYY/MM/DD（事件開始或公布日）","period":"YYYY/MM/DD 或 YYYY/MM/DD～YYYY/MM/DD（持續中請寫起日～迄今）","points":["事實：…","背景：…","影響：…"],"trend":"趨勢預測（需是推測，並說明依據）","imp":3,"cos":[{"n":"業者名稱","s":"代號"}],"url":"實際搜尋到的網址"}。` + IMP + '只回傳純 JSON。';

const [reg, deepNew, ...cos] = await pool([() => gem(regPrompt), () => gem(deepPrompt), ...chunks.map((c, i) => () => gem(base + `\n任務：${fmt(c)}。` + EV + (i === 0 ? '另可補充至多 5 家其他有重大進展的生醫公司（sym 用 Yahoo Finance 格式）。' : '')))]);
if (!reg && cos.every(x => !x) && !deepNew) { console.error('AI 全部失敗，不更新'); process.exit(1); }

// ---------- 正規化 ----------
const merge = (a, b, key) => { const m = new Map(a.map(x => [key(x), x])); b.forEach(x => m.set(key(x), x)); return [...m.values()].filter(x => (x.date || x.d) >= keep); };
const newReg = (reg || []).map(x => {
  const o = Number.isInteger(x.ref) ? offi[x.ref] : null;
  return { ...x, ...(o ? { date: o.date, url: o.l, org: o.org, off: 1, v: 1 } : {}), imp: nImp(x.imp) };
}).filter(x => x.name && okd(x.date) && x.date >= from);
const newCo = cos.flatMap(x => x || []).filter(e => e.sym && okd(e.date) && e.date >= from && e.date <= today).map(e => ({ ...e, imp: nImp(e.imp), kind: nKind(e.kind) }));
const okDeep = x => x && DT.includes(x.type) && okd(x.d) && x.d >= dFrom && x.d <= today && x.title;
const newDeep = (deepNew || []).filter(okDeep).map(x => ({ ...x, imp: nImp(x.imp) }));

// ---------- 連結驗證（只驗證新項目；404/410 移除，其餘無法確認者標示未驗證）----------
async function verify(e) {
  if (e.v === 1) return;
  if (!/^https?:\/\//.test(e.url || '')) { e.url = ''; e.v = -1; return; }
  try {
    const r = await fetch(e.url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    await r.body?.cancel();
    if (r.status === 404 || r.status === 410) { e.url = ''; e.v = -1; }
    else if (r.ok) { e.url = r.url || e.url; e.v = 1; }
    else e.v = 0;
  } catch { e.v = 0; }
}
const toCheck = [...newReg, ...newCo, ...newDeep].filter(e => e.v === undefined).slice(0, 80);
for (let i = 0; i < toCheck.length; i += 8) await Promise.all(toCheck.slice(i, i + 8).map(verify));
console.log('連結驗證：', toCheck.length, '筆，失效', toCheck.filter(e => e.v === -1 && !e.url).length);

const out = {
  ts: Date.now(), window: DAYS, T, srcs, aiCalls: calls, slot,
  reg: merge(old.reg, newReg, x => x.name + '@' + x.date),
  co: merge(old.co, newCo, e => e.sym + '@' + e.date + (e.event || '').slice(0, 20)),
  quotes: old.quotes || {},
  deep: merge((old.deep || []).filter(x => x.d), newDeep, x => x.title)
};

// ---------- 報價（失敗時保留舊價並標示過期）----------
async function quote(s) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const x = (await r.json()).chart.result[0], k = [];
    x.timestamp.forEach((t, i) => { const c = x.indicators.quote[0].close[i]; if (c != null) k.push([t, c]); });
    const a = k.at(-1), b = k.at(-2), g = x.meta.currentTradingPeriod.regular, n = Date.now() / 1000;
    return { p: +a[1].toFixed(2), pct: +((a[1] - b[1]) / b[1] * 100).toFixed(2), cur: x.meta.currency,
      date: new Date(a[0] * 1000).toLocaleDateString('en-CA', { timeZone: x.meta.exchangeTimezoneName || 'UTC' }).replace(/-/g, '/'), live: n >= g.start && n <= g.end };
  } catch { return null; }
}
let qfail = 0;
for (const s of new Set([...T.map(t => t.s), ...out.co.map(e => e.sym)])) {
  const q = await quote(s);
  if (q) out.quotes[s] = q; else { qfail++; if (out.quotes[s]) out.quotes[s].stale = 1; }
  await sleep(200);
}
out.qfail = qfail;

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/report.json', JSON.stringify(out));
console.log('完成：事件', out.co.length, '藥監', out.reg.length, '深度', out.deep.length, '報價', Object.keys(out.quotes).length, '報價失敗', qfail, 'AI 呼叫', calls);

// ---------- 每週摘要歸檔（週一或 FORCE_DIGEST=1）----------
const wd = new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
if (wd === 'Mon' || process.env.FORCE_DIGEST) {
  const f7 = ymd(Date.now() - 7 * 864e5), c = s => String(s ?? '').replace(/\n/g, ' ');
  const pm = s => { const q = out.quotes[s]; return q ? `${q.p} ${q.cur || ''} ${q.pct > 0 ? '▲+' : q.pct < 0 ? '▼' : '●'}${q.pct}% (${q.date})` : '無報價'; };
  const lk = e => e.url ? ` [來源](${e.url})${e.v === 0 ? '（未驗證）' : ''}` : '';
  const R7 = out.reg.filter(x => x.date >= f7).sort((a, b) => (b.imp || 3) - (a.imp || 3) || b.date.localeCompare(a.date)).slice(0, 30);
  const C7 = out.co.filter(e => e.date >= f7 && (e.imp || 3) >= 3).sort((a, b) => (b.imp || 3) - (a.imp || 3) || b.date.localeCompare(a.date));
  const D7 = out.deep.filter(d => d.d >= f7).sort((a, b) => (b.imp || 3) - (a.imp || 3));
  const md = `# 生技醫療週報 ${f7} ～ ${today}\n\n## 一、各國藥監機關動態\n\n` + (R7.map(x => `- **[${x.org}] ${c(x.name)}**（${x.date}｜重要 ${x.imp || 3}）${c(x.company)}；${c(x.indication)}；${c(x.type)}。${c(x.value)}${lk(x)}`).join('\n') || '無') +
    '\n\n## 二、業者重大進展（重要性 3 以上）\n\n' + (C7.map(e => `- **${c(e.name || e.sym)} (${e.sym})** ${pm(e.sym)}｜${e.date}｜${e.kind || '其他'}｜重要 ${e.imp || 3}\n  - ${c(e.event)}${lk(e)}\n  - 催化劑：${c(e.catalyst || '—')}；影響：${c(e.impact || '—')}`).join('\n') || '無') +
    '\n\n## 三、政策、重大事件與技術突破\n\n' + (D7.map(d => `### [${d.type}] ${d.title}（${d.period || d.d}）\n${(d.points || []).map(p => '- ' + p).join('\n')}\n\n趨勢預測（推測）：${c(d.trend || '—')}\n\n相關業者：${(d.cos || []).map(x => x.s ? `${x.n}（${x.s}）` : x.n).join('、') || '—'}${lk(d)}\n`).join('\n') || '無') +
    '\n\n> AI 搜尋與官方來源整理，請與原始來源核對；不構成投資建議。\n';
  fs.mkdirSync('reports', { recursive: true });
  const name = `weekly-${today.replace(/\//g, '')}.md`;
  fs.writeFileSync('reports/' + name, md);
  const idx = rd('reports/index.json', []).filter(x => x.f !== name);
  idx.unshift({ f: name, from: f7, to: today });
  fs.writeFileSync('reports/index.json', JSON.stringify(idx.slice(0, 60)));
  console.log('已產生週報', name);
}
