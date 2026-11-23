import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index2.html', import.meta.url), 'utf8');

test('index2 unified workbench inline JavaScript parses', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, 'expected an inline script');
  for (const match of scripts) new vm.Script(match[1]);
});

test('index2 presents daily intelligence before deep analysis and period-based major events', () => {
  const daily = html.indexOf('id="dailySection"');
  const deep = html.indexOf('id="deepSection"');
  const major = html.indexOf('id="majorSection"');
  assert.ok(daily >= 0 && deep > daily && major > deep);
  assert.ok(html.includes('data/reports_index.json'));
  assert.ok(html.includes('data/report.json'));
});

test('index2 consolidates regulator events by five agencies and company events by company', () => {
  for (const token of ["const AGENCIES=['FDA','EMA','NMPA','PMDA','TFDA']", 'function agencyKey(x)', 'for(const agency of AGENCIES)', "groupBy(cos,x=>x.name||x.company||x.n||x.sym||x.ticker||'未標示公司')", 'function recordMarkup(x,kind)', 'function renderMajor()']) {
    assert.ok(html.includes(token), 'missing '+token);
  }
  assert.ok(html.includes('class="entity-card"'));
  assert.ok(html.includes('class="record"'));
});

test('index2 offers simple date, keyword, visibility, theme, and local priority settings', () => {
  for (const id of ['range','keyword','showDaily','showDeep','showMajor','themeBtn']) {
    assert.ok(html.includes('id="'+id+'"'), 'missing '+id);
  }
  assert.ok(html.includes('healthcare.index2.settings'));
  assert.ok(!html.includes('watchInput'));
  assert.ok(!html.includes('watchChips'));
});

test('index2 includes a tiered batch-query recommendation without changing source workflows', () => {
  for (const phrase of ['第 1 層｜高市值／高關注','第 2 層｜中型市值／成長型','第 3 層｜小型／早期／低關注','每批約 20–30 家']) {
    assert.ok(html.includes(phrase), 'missing '+phrase);
  }
});

test('major events use responsive expandable agency, company, and catalyst cards', () => {
  for (const cls of ['agency-card','entity-card','catalyst-card','record-body','stock-event-grid','stock-event']) assert.ok(html.includes(cls));
  assert.ok(html.includes('@media(max-width:760px)'));
  assert.ok(html.includes('grid-template-columns:1fr'));
  for (const token of ['details class="agency-card"','class="entity-card"','details class="catalyst-card"']) assert.ok(html.includes(token));
});

test('catalyst tracking does not infer a scheduled date or status from an event date', () => {
  assert.ok(html.includes('原始資料未提供'));
  assert.ok(html.includes('x.expectedDate||x.expected_date||x.catalystDate'));
  assert.ok(html.includes('此期間資料沒有獨立的催化劑欄位'));
});


test('company events and analyses use compact single-row reader layout', () => {
  for (const token of ['stock-event-grid{display:block','stock-event{display:flex','deep-row{display:flex','function meaningfulCompanyRecord','const merged={...sorted[0]','summary:[...new Set(sorted.map','date:[...new Set(sorted.map']) {
    assert.ok(html.includes(token), 'missing '+token);
  }
  assert.ok(html.includes('stock-price'));
  assert.ok(html.includes('stock-change'));
  assert.ok(html.includes('stock-event-summary'));
  assert.ok(html.includes('stock-event-meta'));
  assert.ok(!html.includes('watchlist'));
  assert.ok(!html.includes('關注名單'));
  assert.ok(!html.includes('watchInput'));
  assert.ok(!html.includes('watchChips'));
});

test('company boilerplate updates and empty regulator/catalyst sections are suppressed', () => {
  assert.ok(html.includes('本週持穩無重大新增事件'));
  assert.ok(html.includes('if(!text)return false'));
  assert.ok(html.includes('if(!list.length)continue'));
  assert.ok(html.includes('if(cats.length)h+='));
  assert.ok(!html.includes("||'原始資料未提供')"));
});
