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
  assert.match(html, /groupBy\(regs,x=>x\.org\|\|'其他機關'\)/);
  assert.match(html, /groupBy\(cos,x=>x\.name\|\|x\.sym\|\|'未標示公司'\)/);
  assert.match(html, /監管機關彙整/);
  assert.match(html, /k==='reg'\?groupBy\(items,x=>x\.group\|\|'未標示機關'\)/);
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
