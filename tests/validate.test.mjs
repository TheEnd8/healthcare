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

test('catalyst outcome fields are retained for historical reconciliation', async () => {
  const { validateCatalysts } = await import('../scripts/validate.mjs');
  const past = {company:'Example Bio',asset:'Drug X',type:'臨床讀出',status:'結果已公布',date:'2026/10/20',title:'Phase 3 results',sourceName:'Company IR',url:'https://example.com/ir',outcomeStatus:'優於預期',actualDate:'2026/10/20',outcomeSummary:'Primary endpoint met',outcomeImpactFollowup:'Potentially improves regulatory confidence'};
  const [row] = validateCatalysts([past],'2026/10/24','2029/10/24');
  assert.equal(row.outcomeStatus,'優於預期');
  assert.equal(row.actualDate,'2026/10/20');
  assert.equal(row.outcomeSummary,'Primary endpoint met');
  assert.equal(row.outcomeImpactFollowup,'Potentially improves regulatory confidence');
});


test('catalyst quality audit flags source, date, outcome-date, lifecycle conflict, and duplicates', async () => {
  const { auditCatalysts } = await import('../scripts/validate.mjs');
  const base = { company: 'Example Bio', asset: 'Drug A', type: '臨床讀出', status: '已延期', date: '2027/01/01', title: 'Phase 3 readout', sourceName: '', url: 'bad', outcomeStatus: '優於預期', actualDate: '' };
  const issues = auditCatalysts([base, { ...base }]);
  const codes = issues.map(x => x.code);
  assert.ok(codes.includes('missing_source_name'));
  assert.ok(codes.includes('invalid_source_url'));
  assert.ok(codes.includes('outcome_missing_actual_date'));
  assert.ok(codes.includes('lifecycle_outcome_conflict'));
  assert.ok(codes.includes('possible_duplicate'));
});
test('catalyst quality audit distinguishes missing actual dates from unpublished outcomes', async () => {
  const { auditCatalysts } = await import('../scripts/validate.mjs');
  const row = { company: 'Example Bio', asset: 'Drug A', type: '臨床讀出', status: '預估', date: '2027/01/01', title: 'Phase 3 readout', sourceName: 'Company IR', url: 'https://example.com', outcomeStatus: '尚未公布' };
  assert.equal(auditCatalysts([row]).some(x => x.code === 'outcome_missing_actual_date'), false);
  assert.equal(auditCatalysts([{ ...row, date: '2027/02/30' }]).some(x => x.code === 'invalid_expected_date'), true);
});
