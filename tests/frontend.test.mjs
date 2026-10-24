import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(new URL('../investment.html', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

test('investment workspace inline JavaScript parses', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, 'expected an inline script');
  for (const match of scripts) new vm.Script(match[1]);
});
test('investment workspace exposes watchlist and CSV export controls', () => {
  assert.match(html, /id="follow"/);
  assert.match(html, /id="export"/);
  assert.match(html, /healthcare\.watchlist/);
  assert.match(html, /healthcare-investment-events\.csv/);
});
test('admin page does not persist the personal access token', () => {
  assert.doesNotMatch(admin, /localStorage\.gt\s*=/);
  assert.match(admin, /finally\{\$\('#gt'\)\.value=''\}/);
});

test('investment workspace exposes a separate forward-catalyst view', () => {
  assert.match(html, /value="catalyst"/);
  assert.match(html, /未來催化劑/);
  assert.match(html, /r\.cat\|\|\[\]/);
  assert.match(html, /來源：/);
});

test('updater module passes Node syntax check', () => {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../scripts/update.mjs', import.meta.url))]);
});

test('catalyst cards expose lifecycle status and date-change history', () => {
  assert.match(html, /e\.lifecycle/);
  assert.match(html, /日期變更紀錄/);
  assert.match(html, /class="tag lifecycle"/);
});

test('catalyst lifecycle filter and CSV history fields are available', () => {
  assert.match(html, /id="lifecycle"/);
  assert.match(html, /日期已過・待確認/);
  assert.match(html, /日期變更次數/);
  assert.match(html, /\('#lifecycle'\)/);
});

test('investment workspace exposes explainable three-factor research scoring', () => {
  assert.match(html, /function assess\(e\)/);
  assert.match(html, /importance\/5/);
  assert.match(html, /時間敏感度/);
  assert.match(html, /來源品質/);
  assert.match(html, /研究優先/);
  assert.match(html, /\/100/);
});

test('catalyst outcome tracking is displayed and exported', () => {
  assert.match(html, /function outcomeMarkup\(e\)/);
  assert.match(html, /結果追蹤/);
  assert.match(html, /實際公告日期/);
  assert.match(html, /outcomeImpactFollowup/);
  assert.match(html, /結果摘要/);
});

test('catalyst expected-versus-actual timing variance is shown and exported', () => {
  assert.match(html, /function dateVariance\(e\)/);
  assert.match(html, /function varianceMarkup\(e\)/);
  assert.match(html, /預定／實際日期差異/);
  assert.match(html, /日期差異（天；實際－預定）/);
  assert.match(html, /時程差異標籤/);
  assert.match(html, /dateVariance\(e\)\?\.days/);
});

test('catalyst historical review dashboard shows descriptive counts and caveats', () => {
  assert.match(html, /催化劑歷史回顧/);
  assert.match(html, /function renderReviewDashboard\(\)/);
  assert.match(html, /reviewKnown/);
  assert.match(html, /reviewVarianceN/);
  assert.match(html, /結果狀態分布/);
  assert.match(html, /時程差異分布/);
  assert.match(html, /不代表預測能力或投資績效/);
  assert.match(html, /缺失資料與選樣偏差/);
});
