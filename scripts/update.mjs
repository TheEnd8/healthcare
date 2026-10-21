import fs from 'node:fs';

const KEY = process.env.GEMINI_KEY, DAYS = +(process.env.DAYS || 1);
if (!KEY) { console.error('缺少 GEMINI_KEY'); process.exit(1); }
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const T = rd('tickers.json', []);
const old = rd('data/report.json', { reg: [], co: [], quotes: {}, deep: [] });
const ymd = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }).replace(/-/g, '/');
const today = ymd(Date.now()), from = ymd(Date.now() - DAYS * 864e5), keep = ymd(Date.now() - 400 * 864e5);
const okd = d => /^\d{4}\/\d{2}\/\d{2}$/.test(d || '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gem(prompt, search = true) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 }, ...(search ? { tools: [{ google_search: {} }] } : {}) })
    });
    if (r.status === 429 || r.status >= 500) { console.error('Gemini 暫時失敗 HTTP', r.status, '，稍後重試'); await sleep(25000); continue; }
    const j = await r.json();
    if (!r.ok) { console.error('Gemini 錯誤 HTTP', r.status, j.error?.message || ''); return null; }
    const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/```json|```/g, '').trim();
    try { return JSON.parse(t.slice(t.search(/[\[{]/))); } catch { /* retry */ }
  }
  return null;
}

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

const recent = [...old.reg.map(x => x.name), ...old.co.map(e => `${e.name || e.sym}:${(e.event || '').slice(0, 20)}`)].slice(-80).join('；') || '無';
const base = `現在時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台北）。報導區間：${from} ～ ${today}（含）。` +
  '規則：只收錄此區間內實際發生、且已用搜尋找到來源佐證的事件；日期一律 YYYY/MM/DD，無法確認者不得收錄；不可捏造；url 須為實際搜尋到的網址。' +
  '涵蓋美國、歐洲、日本、中國、澳洲、臺灣及其他重要地區當前或前夜最新動態；板塊含生技醫藥、醫療科技(MedTech)、智慧醫療、醫療服務、醫藥通路、健康管理、長壽科技。' +
  `以下事項已收錄，除非有實質新進展，否則不得重複：${recent}。只回傳純 JSON。`;
const EV = '只輸出區間內有「實質重大進展」(臨床、核准、財報、併購、訴訟、法規等)的公司，沒有就不要輸出。回傳陣列，每筆 {"sym":"代號(須與提供者一致)","name":"公司","market":"市場","date":"YYYY/MM/DD","event":"重大進展","catalyst":"後續催化劑與預定日","impact":"市場影響評估一句","url":""}。';
const top = T.filter(t => t.top), watch = T.filter(t => !t.top);
const fmt = l => l.map(x => `${x.n}(${x.s})`).join('、');

const jobs = [
  gem(base + '\n任務：各國藥監機關（FDA、EMA、NMPA、TFDA、PMDA，可加 TGA、MHRA、Health Canada）的政策、規定、新核准、優先審查、部會/委員會審議、即將到期的 PDUFA 日或 CHMP 意見。回傳陣列，最多 20 筆，每筆 {"org":"FDA|EMA|NMPA|TFDA|PMDA|其他","name":"藥品/醫材","company":"藥廠/單位","date":"YYYY/MM/DD","indication":"適應症","type":"核准/優先審查/PDUFA/CHMP意見/政策/審議中","value":"商業與臨床價值一句","url":""}'),
  gem(base + `\n任務：全球指標生醫業者：${fmt(top.slice(0, 12))}。` + EV),
  gem(base + `\n任務：全球指標生醫業者：${fmt(top.slice(12))}。` + EV + '另可補充至多 5 家其他有重大進展的生醫公司（sym 用 Yahoo Finance 格式）。'),
  gem(base + `\n任務：關注標的：${fmt(watch)}。` + EV)
];
const [reg, c1, c2, c3] = await Promise.all(jobs);
if (!reg && !c1 && !c2 && !c3) { console.error('AI 全部失敗，不更新'); process.exit(1); }

const merge = (a, b, key) => { const m = new Map(a.map(x => [key(x), x])); b.forEach(x => m.set(key(x), x)); return [...m.values()].filter(x => x.date >= keep); };
const newReg = (reg || []).filter(x => okd(x.date) && x.date >= from);
const newCo = [...(c1 || []), ...(c2 || []), ...(c3 || [])].filter(e => e.sym && okd(e.date) && e.date >= from && e.date <= today);
const out = {
  ts: Date.now(), window: DAYS, T,
  reg: merge(old.reg, newReg, x => x.name + '@' + x.date),
  co: merge(old.co, newCo, e => e.sym + '@' + e.date + (e.event || '').slice(0, 20)),
  quotes: old.quotes || {}, deep: old.deep || []
};

for (const s of new Set([...T.map(t => t.s), ...out.co.map(e => e.sym)])) { const q = await quote(s); if (q) out.quotes[s] = q; await sleep(200); }

const wk = ymd(Date.now() - 7 * 864e5);
const dg = JSON.stringify({ reg: out.reg.filter(x => x.date >= wk).slice(0, 15), co: out.co.filter(e => e.date >= wk).slice(0, 25) }).slice(0, 14000);
const deep = await gem('以下是近一週資料(JSON)：' + dg + '\n請挑選最具代表性的 3–5 項核准藥品或突破技術，只使用上述資料，不得加入資料外的事實。回傳陣列，每筆 {"title":"","points":["條列：事實/機轉/臨床價值/風險"],"trend":"產業趨勢預測"}。只回傳 JSON。', false);
if (deep?.length) out.deep = deep;

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/report.json', JSON.stringify(out));
console.log('完成：事件', out.co.length, '藥監', out.reg.length, '報價', Object.keys(out.quotes).length);
