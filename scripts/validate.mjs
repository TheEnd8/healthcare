// Strict, deterministic validation for AI-generated healthcare intelligence records.
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('/').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}
export function isWithin(value, from, to) {
  return isValidDate(value) && value >= from && value <= to;
}
export function validateRegulatoryEvents(items, from, to) {
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x === 'object' &&
    typeof x.name === 'string' && x.name.trim() &&
    typeof x.company === 'string' && x.company.trim() &&
    isWithin(x.date, from, to) && isHttpUrl(x.url));
}
export function validateCompanyEvents(items, from, to) {
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x === 'object' &&
    typeof x.sym === 'string' && x.sym.trim() &&
    typeof x.name === 'string' && x.name.trim() &&
    typeof x.event === 'string' && x.event.trim() &&
    isWithin(x.date, from, to) && isHttpUrl(x.url));
}
const DEEP_TYPES = new Set(['政策變化', '重大事件', '技術突破']);
export function validateDeepEvents(items, from, to) {
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x === 'object' &&
    DEEP_TYPES.has(x.type) && typeof x.title === 'string' && x.title.trim() &&
    isWithin(x.d, from, to) && isHttpUrl(x.url) &&
    Array.isArray(x.points) && x.points.length > 0);
}

// Validation for catalyst lifecycle dates, including recently passed milestones.
function shiftDate(value, days) {
  const [y, m, d] = value.split('/').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('/');
}
export function validateCatalysts(items, today, horizon) {
  const types = new Set(['臨床讀出', '臨床試驗啟動/完成', 'PDUFA/監管決策', 'CHMP/監管意見', '上市申請', '財報/指引', '專利/商業里程碑', '其他']);
  const statuses = new Set(['已確認', '預估', '公司指引', '待確認', '結果已公布', '已延期', '已取消']);
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x === 'object' && typeof x.company === 'string' && x.company.trim() && typeof x.asset === 'string' && x.asset.trim() && types.has(x.type) && statuses.has(x.status) && isValidDate(x.date) && x.date >= shiftDate(today, -400) && x.date <= horizon && typeof x.title === 'string' && x.title.trim() && typeof x.sourceName === 'string' && x.sourceName.trim() && isHttpUrl(x.url));
}


// Audit catalyst records without silently correcting or inferring outcomes.
const OUTCOME_LABELS = new Set(['優於預期', '符合預期', '低於預期', '結果不明']);
export function auditCatalysts(items) {
  if (!Array.isArray(items)) return [{ code: 'invalid_collection', severity: 'error', message: '催化劑資料不是陣列', index: null }];
  const issues = [];
  const seen = new Map();
  const add = (code, severity, message, index, key) => issues.push({ code, severity, message, index, key: key || '' });
  items.forEach((x, index) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) { add('invalid_record','error','紀錄格式不是物件',index); return; }
    const company = typeof x.company === 'string' ? x.company.trim() : '';
    const asset = typeof x.asset === 'string' ? x.asset.trim() : '';
    const title = typeof x.title === 'string' ? x.title.trim() : '';
    const type = typeof x.type === 'string' ? x.type.trim() : '';
    const date = typeof x.date === 'string' ? x.date.trim() : '';
    const url = typeof x.url === 'string' ? x.url.trim() : '';
    const sourceName = typeof x.sourceName === 'string' ? x.sourceName.trim() : '';
    if (!company) add('missing_company','error','缺少公司名稱',index,title);
    if (!asset) add('missing_asset','warning','缺少產品／試驗名稱',index,title);
    if (!title) add('missing_title','error','缺少事件標題',index,company);
    if (!sourceName) add('missing_source_name','warning','缺少來源名稱',index,title);
    if (!isHttpUrl(url)) add('invalid_source_url','error','來源網址缺失或不是有效 HTTP(S) URL',index,title);
    if (!isValidDate(date)) add('invalid_expected_date','error','預定日期格式或日曆日期無效',index,title);
    if (x.actualDate != null && String(x.actualDate).trim() && !isValidDate(String(x.actualDate).trim())) add('invalid_actual_date','error','實際公告日期格式或日曆日期無效',index,title);
    const outcome = typeof x.outcomeStatus === 'string' ? x.outcomeStatus.trim() : '';
    const actualDate = typeof x.actualDate === 'string' ? x.actualDate.trim() : '';
    if (OUTCOME_LABELS.has(outcome) && !actualDate) add('outcome_missing_actual_date','warning','已有結果判定，但缺少實際公告日期；請回查來源',index,title);
    if (['已延期','已取消'].includes(x.status) && OUTCOME_LABELS.has(outcome)) add('lifecycle_outcome_conflict','warning','催化劑狀態為延期／取消，但結果欄位同時標示結果已判定；請人工核對',index,title);
    const identity = [company.toLowerCase(),asset.toLowerCase(),type.toLowerCase(),title.toLowerCase(),date].join('|');
    if (company && asset && title && type && date) {
      if (seen.has(identity)) add('possible_duplicate','warning','與另一筆紀錄的公司、產品、類型、標題及預定日期相同',index,title+'（疑似重複第 '+(seen.get(identity)+1)+' 筆）');
      else seen.set(identity,index);
    }
  });
  return issues;
}
