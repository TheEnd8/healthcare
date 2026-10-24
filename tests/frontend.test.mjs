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


test('catalyst segment review groups by company, indication, or type with a minimum sample threshold', () => {
  assert.match(html, /公司／適應症分組回顧/);
  assert.match(html, /id="segmentBy"/);
  assert.match(html, /function renderSegmentReview\(\)/);
  assert.match(html, /未標註適應症/);
  assert.match(html, /樣本不足（n<5）/);
  assert.match(html, /描述性統計/);
});


test('investment workspace exposes catalyst data quality audit', () => {
  assert.match(html, /催化劑資料品質檢查/);
  assert.match(html, /function renderQualityAudit\(\)/);
  assert.match(html, /outcome_missing_actual_date/);
  assert.match(html, /疑似重複事件/);
  assert.match(html, /不自動修正資料/);
});


test('catalyst quality audit links individual warnings to source and event search', () => {
  assert.match(html, /data-quality-search/);
  assert.match(html, /data-quality-company/);
  assert.match(html, /id="qualitySeverity"/);
  assert.match(html, /只看錯誤/);
  assert.match(html, /檢視來源 ↗/);
  assert.match(html, /定位事件/);
  assert.match(html, /safeUrl\(e\.url\)/);
});


test('catalyst evidence traceability shows source facts and saves local review metadata', () => {
  assert.match(html, /function evidenceTraceMarkup\(e\)/);
  assert.match(html, /來源證據摘要/);
  assert.match(html, /data-review-status/);
  assert.match(html, /data-review-notes/);
  assert.match(html, /data-save-review/);
  assert.match(html, /healthcare\.catalystReviews/);
  assert.match(html, /人工覆核備註/);
  assert.match(html, /evidenceSummary/);
  assert.match(html, /來源證據摘要/);
});


test('catalyst review ledger supports portable JSON export and conflict-safe import', () => {
  assert.match(html, /id="exportReviews"/);
  assert.match(html, /id="importReviews"/);
  assert.match(html, /healthcare\.catalyst-review-ledger/);
  assert.match(html, /schemaVersion:1/);
  assert.match(html, /function exportReviewLedger\(\)/);
  assert.match(html, /較舊紀錄不覆蓋較新版本/);
  assert.match(html, /匯入中止/);
  assert.match(html, /createdAt:prior\.createdAt\|\|now/);
  assert.match(html, /revision=\(Number\(prior\.revision\)\|\|0\)\+1/);
});


test('catalyst review notes keep bounded version history and show prior/current comparison', () => {
  assert.match(html, /function reviewHistoryMarkup\(saved\)/);
  assert.match(html, /review-version-grid/);
  assert.match(html, /history\.slice\(-50\)/);
  assert.match(html, /上一版備註/);
  assert.match(html, /目前備註/);
  assert.match(html, /snapshot=prior\.revision\?/);
});
