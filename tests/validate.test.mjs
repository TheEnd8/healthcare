import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, isHttpUrl, isWithin, validateRegulatoryEvents, validateCompanyEvents, validateDeepEvents } from '../scripts/validate.mjs';

test('calendar dates are validated, not just regex matched', () => {
  assert.equal(isValidDate('2026/10/24'), true);
  assert.equal(isValidDate('2026/02/30'), false);
  assert.equal(isValidDate('2026-10-24'), false);
});
test('source URLs must be valid HTTP(S) URLs', () => {
  assert.equal(isHttpUrl('https://www.fda.gov/news-events'), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('not a url'), false);
  assert.equal(isHttpUrl(''), false);
});
test('event dates are bounded inclusively by the requested window', () => {
  assert.equal(isWithin('2026/10/22', '2026/10/22', '2026/10/24'), true);
  assert.equal(isWithin('2026/10/25', '2026/10/22', '2026/10/24'), false);
});
test('regulatory events reject future, malformed, or unsourced entries', () => {
  const rows = [
    {name:'Drug A',company:'Co A',date:'2026/10/24',url:'https://www.fda.gov/a'},
    {name:'Drug B',company:'Co B',date:'2026/10/25',url:'https://www.fda.gov/b'},
    {name:'Drug C',company:'Co C',date:'2026/02/30',url:'https://www.fda.gov/c'},
    {name:'Drug D',company:'Co D',date:'2026/10/24',url:''}
  ];
  assert.equal(validateRegulatoryEvents(rows, '2026/10/22', '2026/10/24').length, 1);
});
test('company events require identity, date, event text and source', () => {
  const rows = [
    {sym:'ABC',name:'Company',event:'Phase 3 readout',date:'2026/10/24',url:'https://example.com/news'},
    {sym:'XYZ',name:'Company',event:'Bad date',date:'2026/10/25',url:'https://example.com/news'},
    {sym:'BAD',name:'Company',event:'No source',date:'2026/10/24',url:'fake'}
  ];
  assert.equal(validateCompanyEvents(rows, '2026/10/22', '2026/10/24').length, 1);
});
test('deep events require supported type, source, date and points', () => {
  const good = {type:'技術突破',title:'New platform',d:'2026/10/24',url:'https://example.com/a',points:['事實：x']};
  assert.equal(validateDeepEvents([good,{...good,d:'2026/10/25'},{...good,points:[]},{...good,url:'bad'}], '2026/10/22','2026/10/24').length, 1);
});

test('forward catalysts accept sourced future dates but reject missing evidence and distant dates', async () => {
  const { validateCatalysts } = await import('../scripts/validate.mjs');
  const good = {company:'Example Bio',asset:'Drug X',type:'臨床讀出',status:'公司指引',date:'2027/06/30',title:'Phase 3 top-line results',sourceName:'Company investor relations',url:'https://example.com/ir'};
  const rows = [good,{...good,date:'2025/01/01'},{...good,url:'javascript:alert(1)'},{...good,status:'未定義'}];
  assert.equal(validateCatalysts(rows,'2026/10/24','2029/10/24').length,1);
});

test('catalyst validator retains recent past milestones for outcome reconciliation', async () => {
  const { validateCatalysts } = await import('../scripts/validate.mjs');
  const past = {company:'Example Bio',asset:'Drug X',type:'臨床讀出',status:'結果已公布',date:'2026/10/20',title:'Phase 3 top-line results',sourceName:'Company investor relations',url:'https://example.com/ir'};
  assert.equal(validateCatalysts([past],'2026/10/24','2029/10/24').length,1);
});
