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

// Validation for forward-looking catalyst dates; planned dates are intentionally not limited to the news window.
export function validateCatalysts(items, today, horizon) {
  const types = new Set(['臨床讀出', '臨床試驗啟動/完成', 'PDUFA/監管決策', 'CHMP/監管意見', '上市申請', '財報/指引', '專利/商業里程碑', '其他']);
  const statuses = new Set(['已確認', '預估', '公司指引', '待確認', '結果已公布', '已延期', '已取消']);
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x === 'object' && typeof x.company === 'string' && x.company.trim() && typeof x.asset === 'string' && x.asset.trim() && types.has(x.type) && statuses.has(x.status) && isValidDate(x.date) && x.date >= ymd(Date.parse(today.replaceAll('/', '-') + 'T00:00:00Z') - 400 * 864e5) && x.date <= horizon && typeof x.title === 'string' && x.title.trim() && typeof x.sourceName === 'string' && x.sourceName.trim() && isHttpUrl(x.url));
}
