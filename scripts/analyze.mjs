// 每日綜合分析：讀取收件匣中「已由 Gemini 整理好的報告摘要」，只做一次跨報告彙整（不重做每份摘要），
// 輸出到 analysis/，並累積「公司／產業」脈絡資料庫。
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_KEY, MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash', MAXCALLS = +(process.env.AI_MAX_CALLS || 12);
const ONLY = (process.env.ANALYZE_DATE || '').trim();               // 指定日期 YYYYMMDD；留空＝自動補齊最近未分析的日期
if (!KEY) { console.error('缺少 GEMINI_KEY'); process.exit(1); }
const INBOX = [process.env.INBOX_DIR, 'inbox-repo/inbox', 'data/inbox'].filter(Boolean).find(d => fs.existsSync(d));
if (!INBOX) { console.log('找不到收件匣（inbox-repo/inbox 或 data/inbox），結束'); process.exit(0); }

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); };
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const dash = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
const slug = e => String(e.sym || e.n).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff.]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
async function gem(prompt) {
  if (calls >= MAXCALLS) { console.error('已達 AI 呼叫上限'); return null; }
  calls++;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    if (r.status === 429 || r.status >= 500) { console.error('Gemini 暫時失敗 HTTP', r.status); await sleep(25000); continue; }
    const j = await r.json();
    if (!r.ok) { console.error('Gemini 錯誤 HTTP', r.status, j.error?.message || ''); return null; }
    const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/```json|```/g, '').trim();
    try { return JSON.parse(extract(t)); } catch { /* retry */ }
  }
  return null;
}

// ---------- 找出待處理日期 ----------
const days = fs.readdirSync(INBOX).filter(d => /^\d{8}$/.test(d)).sort().reverse();
const todo = [];
for (const d of ONLY ? [ONLY] : days) {
  const dir = path.join(INBOX, d); if (!fs.existsSync(dir)) continue;
  const reps = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => rd(path.join(dir, f), null)).filter(r => r && r.id && (r.summary || r.title));
  if (!reps.length) continue;
  const done = rd(`analysis/daily/${dash(d)}.json`, null);
  const have = new Set((done?.reports || []).map(r => r.id));
  if (!ONLY && done && reps.every(r => have.has(String(r.id)))) continue;
  todo.push({ d, reps });
  if (!ONLY && todo.length >= 5) break;
}
if (!todo.length) { console.log('沒有需要分析的新報告'); process.exit(0); }

const eIndex = rd('analysis/entities/index.json', []);
for (const { d, reps } of todo.reverse()) {
  const date = dash(d);
  const R = reps.map((r, i) => ({ ref: 'R' + (i + 1), id: String(r.id), title: strip(r.title), source: strip(r.source), date: r.date || '', driveUrl: r.driveUrl || '', tg: r.tg || '', company: strip(r.company), tags: strip(r.hashtags), summary: strip(r.summary).slice(0, 700) }));

  // 1) 抽取每份報告涉及的公司／產業（20 份一批）
  const ex = {};
  for (let i = 0; i < R.length; i += 20) {
    const part = R.slice(i, i + 20);
    const out = await gem('以下是研究報告摘要（已由 AI 整理過）。請為每份報告抽取 entities（報告重點討論的公司、產業、技術主題，最多 6 個；公司請給正式中文名稱，若為上市公司附 Yahoo Finance 格式代號 sym，否則空字串；type 為 company、industry 或 theme）與 key（一句重點，40 字內）。「主題」欄位是報告的主要對象（例如 2330TW-台積電、MU-美光），請優先採用並換成 Yahoo Finance 代號格式（台股 .TW 或 .TWO、日股 .T、美股不加後綴）；只根據提供文字，不可捏造。回傳 JSON 陣列 [{"id":"R1","entities":[{"n":"","type":"company","sym":""}],"key":""}]。\n\n' +
      part.map(r => `[${r.ref}] ${r.title}｜${r.source}${r.company ? '｜主題：' + r.company : ''}${r.tags ? '｜標籤：' + r.tags : ''}\n${r.summary}`).join('\n\n'));
    (out || []).forEach(o => { if (o?.id) ex[o.id] = o; });
  }
  const ents = new Map();
  R.forEach(r => {
    const o = ex[r.ref] || {};
    r.key = strip(o.key); r.entities = [];
    (o.entities || []).slice(0, 6).filter(e => e?.n).forEach(e => {
      const E = { n: strip(e.n), type: ['company', 'industry', 'theme'].includes(e.type) ? e.type : 'theme', sym: strip(e.sym) };
      const s = slug(E); r.entities.push(s);
      if (!ents.has(s)) ents.set(s, { slug: s, ...E });
    });
  });

  // 2) 取出這些對象過去的脈絡
  const hist = [...ents.values()].map(e => {
    const f = rd(`analysis/entities/${e.slug}.json`, null);
    const m = (f?.mentions || []).filter(x => x.date < date).slice(0, 3);
    return m.length ? `${e.n}：` + m.map(x => `${x.date} ${(x.reports || []).map(r => r.key).filter(Boolean).join('；')}`).join(' ／ ') : '';
  }).filter(Boolean).join('\n') || '（無）';

  // 3) 跨報告總體分析
  const A = await gem(`你是產業研究總編。以下是 ${date} 收到的 ${R.length} 份報告重點與所涉公司／產業，以及這些對象過去的脈絡。請產出總體分析。規則：只根據提供內容，不得新增外部事實或數字；引用報告用 [R#]；若歷史脈絡相關，說明「相較先前」的變化；意見分歧要明確標示；使用繁體中文。` +
    '回傳 JSON {"headline":"一句話主標題","overview":"3–5 句總體觀","themes":[{"title":"","summary":"2–4 句，含 [R#] 引用","change":"相較先前的變化，無則空字串","entities":["實體名稱"],"reports":["R1"]}],"consensus":["跨報告共識"],"divergence":["分歧或矛盾"],"risks":["風險"],"watch":["待追蹤事項（若有預定日期請寫出）"]}。\n\n【報告】\n' +
    R.map(r => `[${r.ref}] ${r.title}｜${r.source}｜重點：${r.key || r.summary.slice(0, 120)}｜對象：${r.entities.join('、')}`).join('\n') + '\n\n【歷史脈絡】\n' + hist);
  if (!A) { console.error(`${date} 總體分析失敗，略過`); continue; }

  const nameToSlug = Object.fromEntries([...ents.values()].map(e => [e.n, e.slug]));
  const daily = {
    date, ts: Date.now(), headline: strip(A.headline), overview: strip(A.overview),
    themes: (A.themes || []).map(t => ({ title: strip(t.title), summary: strip(t.summary), change: strip(t.change), entities: (t.entities || []).map(n => nameToSlug[n]).filter(Boolean), reports: (t.reports || []).map(String) })),
    consensus: (A.consensus || []).map(strip), divergence: (A.divergence || []).map(strip), risks: (A.risks || []).map(strip), watch: (A.watch || []).map(strip),
    entities: [...ents.values()],
    reports: R.map(({ summary, company, tags, ...r }) => r)           // 公開輸出不含每份報告的摘要全文，只留標題、來源、連結與一句重點
  };
  wr(`analysis/daily/${date}.json`, daily);
  wr(`analysis/daily/${date}.md`, `# ${date} 每日綜合分析：${daily.headline}\n\n${daily.overview}\n\n## 主題\n\n` + daily.themes.map(t => `### ${t.title}\n${t.summary}\n${t.change ? `\n**相較先前：** ${t.change}\n` : ''}`).join('\n') +
    `\n## 共識\n${daily.consensus.map(x => '- ' + x).join('\n') || '—'}\n\n## 分歧\n${daily.divergence.map(x => '- ' + x).join('\n') || '—'}\n\n## 風險\n${daily.risks.map(x => '- ' + x).join('\n') || '—'}\n\n## 待追蹤\n${daily.watch.map(x => '- ' + x).join('\n') || '—'}\n\n## 報告與對象\n\n` +
    daily.reports.map(r => `- [${r.ref}] ${r.driveUrl ? `[${r.title}](${r.driveUrl})` : r.title}（${r.source}）— ${r.key}｜${r.entities.map(s => ents.get(s)?.n).filter(Boolean).join('、')}`).join('\n') + '\n');

  // 4) 更新「公司／產業」脈絡資料庫
  for (const e of ents.values()) {
    const f = rd(`analysis/entities/${e.slug}.json`, { slug: e.slug, n: e.n, type: e.type, sym: e.sym, mentions: [] });
    if (e.sym && !f.sym) f.sym = e.sym;
    f.mentions = f.mentions.filter(m => m.date !== date);
    f.mentions.unshift({ date, reports: R.filter(r => r.entities.includes(e.slug)).map(r => ({ id: r.id, title: r.title, source: r.source, driveUrl: r.driveUrl, key: r.key })) });
    f.mentions.sort((a, b) => b.date.localeCompare(a.date)); f.mentions = f.mentions.slice(0, 300);
    wr(`analysis/entities/${e.slug}.json`, f);
    const row = { slug: e.slug, n: f.n, type: f.type, sym: f.sym || '', count: f.mentions.length, last: f.mentions[0].date };
    const k = eIndex.findIndex(x => x.slug === e.slug); k < 0 ? eIndex.push(row) : (eIndex[k] = row);
  }
  wr('analysis/entities/index.json', eIndex.sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count));
  const idx = rd('analysis/index.json', []).filter(x => x.date !== date);
  idx.unshift({ date, n: R.length, headline: daily.headline }); idx.sort((a, b) => b.date.localeCompare(a.date));
  wr('analysis/index.json', idx.slice(0, 800));
  console.log(`${date} 完成：${R.length} 份報告、${ents.size} 個對象、AI 呼叫累計 ${calls}`);
}
