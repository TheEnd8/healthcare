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
