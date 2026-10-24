// 由 GitHub Actions 執行：抓報價(Yahoo)、用 Gemini+Google 搜尋整理新事件，累積寫入 data/report.json
import fs from 'node:fs';
import { validateRegulatoryEvents, validateCompanyEvents, validateDeepEvents, validateCatalysts } from './validate.mjs';

const KEY = process.env.GEMINI_KEY, DAYS = +(process.env.DAYS || 1);
if (!KEY) { console.error('缺少 GEMINI_KEY'); process.exit(1); }
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const T = rd('tickers.json', []);
const old = rd('data/report.json', { reg: [], co: [], quotes: {}, deep: [], cat: [] });
const ymd = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }).replace(/-/g, '/');
const today = ymd(Date.now()), from = ymd(Date.now() - DAYS * 864e5), keep = ymd(Date.now() - 400 * 864e5), horizon = ymd(Date.now() + 1095 * 864e5);
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
const ai = T.filter(t => t.ai);
const chunks = []; for (let i = 0; i < ai.length; i += 10) chunks.push(ai.slice(i, i + 10));
const fmt = l => l.map(x => `${x.n}(${x.s})`).join('、');

const jobs = [
  gem(base + '\n任務：各國藥監機關（FDA、EMA、NMPA、TFDA、PMDA，可加 TGA、MHRA、Health Canada）的政策、規定、新核准、優先審查、部會/委員會審議、即將到期的 PDUFA 日或 CHMP 意見。回傳陣列，最多 20 筆，每筆 {"org":"FDA|EMA|NMPA|TFDA|PMDA|其他","name":"藥品/醫材","company":"藥廠/單位","date":"YYYY/MM/DD","indication":"適應症","type":"核准/優先審查/PDUFA/CHMP意見/政策/審議中","value":"商業與臨床價值一句","url":""}'),
  gem(`現在時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台北）。請整理全球生技醫療公司未來三年的臨床與法規催化劑，並回顧最近 400 天內已公布結果、延期或取消的相關事件。只收錄有可追溯來源的資訊；預估日期不可標成已確認，日期須 YYYY/MM/DD，日期不明則不收錄。範圍包括臨床試驗主要讀出、試驗啟動/完成、FDA PDUFA/監管決策、CHMP 意見、上市申請、公司財報/指引、專利與商業里程碑。最多 50 筆，優先上市生技藥廠與 MedTech。status 只能是 已確認、預估、公司指引、待確認、結果已公布、已延期、已取消。只有來源明確證實結果已公布、延期或取消時才使用後三種狀態；結果已公布時 date 填實際公告/讀出日期，並引用官方公司公告、試驗登錄或監管來源。回傳陣列，每筆 {\"company\":\"公司名稱\",\"asset\":\"藥品/產品/試驗\",\"type\":\"臨床讀出|臨床試驗啟動/完成|PDUFA/監管決策|CHMP/監管意見|上市申請|財報/指引|專利/商業里程碑|其他\",\"status\":\"已確認|預估|公司指引|待確認|結果已公布|已延期|已取消\",\"date\":\"YYYY/MM/DD\",\"title\":\"里程碑摘要\",\"sourceName\":\"來源機構或公告名稱\",\"url\":\"實際來源網址\",\"impact\":\"簡短總結\",\"impactFacts\":[\"來源直接支持的事實，附具體來源依據\"],\"impactInference\":[\"明確標示為推論的影響與推論依據\"],\"impactDimensions\":{\"revenue\":\"營收/商業化影響；無資料寫資料不足\",\"timeline\":\"臨床、核准或上市時程影響；無資料寫資料不足\",\"funding\":\"現金跑道/融資需求影響；無資料寫資料不足\",\"competition\":\"競爭格局/差異化影響；無資料寫資料不足\"}}。impactFacts 只能放來源直接支持的事實；impactInference 只能放推論，不可將推論寫成事實。不得虛構營收數字、現金餘額或市場份額；未知請寫資料不足。只回傳純 JSON。`),
  ...chunks.map((c, i) => gem(base + `\n任務：${fmt(c)}。` + EV + (i === 0 ? '另可補充至多 5 家其他有重大進展的生醫公司（sym 用 Yahoo Finance 格式）。' : ''))),
];
const [reg, catalysts, ...cos] = await Promise.all(jobs);
if (!reg && !catalysts && cos.every(x => !x)) { console.error('AI 全部失敗，不更新'); process.exit(1); }

const merge = (a, b, key, dateOf = x => x.date) => { const m = new Map(a.map(x => [key(x), x])); b.forEach(x => m.set(key(x), x)); return [...m.values()].filter(x => dateOf(x) >= keep && dateOf(x) <= today); };
const newReg = validateRegulatoryEvents(reg, from, today);
const newCo = validateCompanyEvents(cos.flatMap(x => x || []), from, today);
const out = {
  ts: Date.now(), window: DAYS, T,
  reg: merge(old.reg, newReg, x => x.name + '@' + x.date),
  co: merge(old.co, newCo, e => e.sym + '@' + e.date + (e.event || '').slice(0, 20)),
  quotes: old.quotes || {}, deep: old.deep || []
};

const validOldCatalysts = validateCatalysts(old.cat || [], today, horizon);
const validNewCatalysts = validateCatalysts(Array.isArray(catalysts) ? catalysts : [], today, horizon);
const catalystIdentity = x => [x.company, x.asset, x.type, x.title].map(v => String(v || '').trim().toLowerCase()).join('@');
const catalystMap = new Map(validOldCatalysts.map(x => [catalystIdentity(x), x]));
for (const item of validNewCatalysts) {
  const key = catalystIdentity(item), prior = catalystMap.get(key);
  const history = Array.isArray(prior?.history) ? [...prior.history] : [];
  if (prior && prior.date !== item.date) history.push({ date: prior.date, recordedAt: today, changedTo: item.date, reason: '來源更新了里程碑日期' });
  catalystMap.set(key, { ...prior, ...item, history });
}
out.cat = [...catalystMap.values()].map(x => ({ ...x, lifecycle: x.status === '結果已公布' ? '結果已公布' : x.status === '已延期' ? '已延期' : x.status === '已取消' ? '已取消' : x.date < today ? '日期已過・待確認' : x.date === today ? '今日到期' : x.history?.length ? '日期曾變更' : '即將到期' })).sort((a, b) => a.date.localeCompare(b.date));

for (const s of new Set([...T.map(t => t.s), ...out.co.map(e => e.sym)])) { const q = await quote(s); if (q) out.quotes[s] = q; await sleep(200); }

const dFrom = ymd(Date.now() - Math.max(DAYS, 14) * 864e5);
const DT = ['政策變化', '重大事件', '技術突破'];
const seenDeep = (old.deep || []).filter(x => x.d).slice(-40).map(x => x.title).join('；') || '無';
const deepNew = await gem(`現在時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台北）。請搜尋 ${dFrom} ～ ${today} 全球生技醫療產業的：` +
  '(1) 政策變化（法規、審查制度、藥價、醫保、關稅、貿易與出口管制等）；(2) 重大事件（疾病、疫情、產業整合、併購、分拆、聯盟、供應鏈事件等）；(3) 技術突破（新機轉、平台技術、重大臨床或科學突破）。' +
  '規則：只收錄已搜尋到來源佐證的事實，不可捏造；日期一律 YYYY/MM/DD；相關業者若為上市公司，代號用 Yahoo Finance 格式，非上市則 s 填空字串。' +
  `已收錄標題（除非有實質新進展，否則不得重複）：${seenDeep}。回傳陣列，最多 12 筆依重要性排序，每筆 {"type":"政策變化|重大事件|技術突破","title":"標題","d":"YYYY/MM/DD（事件開始或公布日）","period":"YYYY/MM/DD 或 YYYY/MM/DD～YYYY/MM/DD（事件期間，持續中請寫起日～迄今）","points":["事實：…","背景：…","影響：…"],"trend":"趨勢預測（需是推測，並說明依據）","cos":[{"n":"業者名稱","s":"代號"}],"url":"實際搜尋到的網址"}。只回傳純 JSON。`);
const validDeep = validateDeepEvents(deepNew, dFrom, today);
out.deep = merge((old.deep || []).filter(x => x.d && x.d >= keep), validDeep, x => x.title, x => x.d);

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/report.json', JSON.stringify(out));console.log('完成：事件', out.co.length, '藥監', out.reg.length, '報價', Object.keys(out.quotes).length);