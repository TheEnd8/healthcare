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
  assert.match(html, /data\/reports_index\.json/);
  assert.match(html, /data\/report\.json/);
});

test('index2 consolidates regulatory events by agency and company events by company', () => {
  assert.match(html, /const AGENCIES=\['FDA','EMA','NMPA','PMDA','TFDA'\]/);\n  assert.match(html, /function agencyKey\(x\)/);\n  assert.match(html, /for\(const agency of AGENCIES\)/);
  assert.match(html, /groupBy\(cos,x=>x\.name\|\|x\.sym\|\|'未標示公司'\)/);\n  assert.match(html, /class=\\"entity-card\\"/);\n  assert.match(html, /class=\\"record\\"/);
  assert.match(html, /監管機關彙整/);
  assert.match(html, /function recordMarkup\(x,kind\)/);\n  assert.match(html, /function renderMajor\(\)/);
});

test('index2 offers simple date, keyword, visibility, theme, and local priority settings', () => {
  for (const id of ['range','keyword','showDaily','showDeep','showMajor','themeBtn','watchInput']) {
    assert.ok(html.includes('id="'+id+'"'), 'missing '+id);
  }
  assert.match(html, /healthcare\.index2\.settings/);
  assert.match(html, /重點標示/);
});

test('index2 includes a tiered batch-query recommendation without changing source workflows', () => {
  assert.match(html, /第 1 層｜高市值／高關注/);
  assert.match(html, /第 2 層｜中型市值／成長型/);
  assert.match(html, /第 3 層｜小型／早期／低關注/);
  assert.match(html, /每批約 20–30 家/);
});

test('major events use responsive expandable agency, company, and catalyst cards', () => {
  for (const cls of ['agency-card','entity-card','catalyst-card','record-body']) {
    assert.ok(html.includes(cls), 'missing responsive component '+cls);
  }
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /grid-template-columns:1fr/);
  assert.match(html, /details class="agency-card"/);
  assert.match(html, /details class="entity-card"/);
  assert.match(html, /details class="catalyst-card"/);
});

test('catalyst tracking does not infer a scheduled date or status from an event date', () => {
  assert.match(html, /原始資料未提供/);
  assert.match(html, /x\.expectedDate\|\|x\.expected_date\|\|x\.catalystDate/);
  assert.match(html, /原始資料沒有獨立的催化劑欄位/);
});
