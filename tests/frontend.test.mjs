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
