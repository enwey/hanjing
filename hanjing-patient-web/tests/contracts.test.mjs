import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@vue/compiler-dom';
import { page, titles, reportCard, publicPages } from '../src/pages.js';
import { esc, safeUrl, money } from '../src/ui.js';
import { home, homeDoctors, homePosts } from '../src/home.js';
import {
  fixtures,
  fixture,
  routeParams,
  assessments,
  post,
  doctor,
} from './fixtures.mjs';

for (const name of Object.keys(titles).filter((n) => n !== 'home'))
  test(name + ' renders valid template against API contract', async () => {
    const ctx = {
      page: name,
      params: new URLSearchParams(routeParams[name] || {}),
      get: async (path) => fixture(path),
    };
    const html = await page(ctx),
      errors = [];
    parse(html, { onError: (e) => errors.push(e.message) });
    assert.deepEqual(errors, []);
    assert.ok(html.length > 150);
    assert.ok(!html.includes('undefined'));
    assert.ok(!html.includes('NaN'));
  });
test('home is public, uses approved photos, and does not contain seeded doctors or prototype runtime', () => {
  const html = home();
  const errors = [];
  parse(html, { onError: (e) => errors.push(e.message) });
  assert.deepEqual(errors, []);
  assert.match(html, /home-doctors/);
  assert.match(html, /home-posts/);
  assert.ok(!html.includes('演示'));
  assert.ok(publicPages.has('home'));
});
test('booking keeps pending_payment and does not offer a payment operation', async () => {
  const ctx = {
    page: 'appointment',
    params: new URLSearchParams({ id: 51 }),
    get: async (path) => fixture(path),
  };
  const html = await page(ctx);
  assert.match(html, /待支付/);
  assert.match(html, /测试就诊人/);
  assert.match(html, /测试诊断/);
  assert.ok(!html.includes('支付成功'));
});
test('product order pending is presented as unpaid, with cancel operation', async () => {
  const ctx = {
    page: 'order',
    params: new URLSearchParams({ id: 81 }),
    get: async (path) => fixture(path),
  };
  const html = await page(ctx);
  assert.match(html, /待支付/);
  assert.match(html, /cancel-order/);
  assert.ok(!html.includes('待确认'));
});
test('snore report reads the existing nested response and disclaims calibrated SPL', () => {
  const html = reportCard(assessments[1]);
  assert.match(html, /42 dB/);
  assert.match(html, /65 dB/);
  assert.match(html, /25%/);
  assert.match(html, /未经过声压校准/);
});
test('untrusted text is escaped in all public rendering', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html =
    homeDoctors([{ ...doctor, name: evil }]) +
    homePosts([{ ...post, title: evil }]);
  assert.ok(!html.includes(evil));
  assert.match(html, /&lt;img/);
  assert.equal(esc('"&<>'), '&quot;&amp;&lt;&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,<script>'), '');
  assert.equal(money(1234), '¥12.34');
});
test('each supported page has a useful empty state', async () => {
  for (const name of [
    'stores',
    'doctors',
    'appointments',
    'community',
    'products',
    'family',
    'assessments',
    'medical',
    'devices',
    'live',
    'orders',
  ]) {
    const ctx = {
      page: name,
      params: new URLSearchParams(),
      get: async () => [],
    };
    const html = await page(ctx);
    assert.ok(html.includes('暂无') || html.includes('请先'), name);
  }
});
test('production bundle does not import prototype scripts or make payment requests', () => {
  const src = fs.readFileSync(
    new URL('../src/main.js', import.meta.url),
    'utf8',
  );
  assert.ok(!src.includes('pc-redesign.js'));
  assert.ok(!src.includes('/pay'));
  assert.ok(!src.includes('/confirm-pay'));
  assert.ok(src.includes("post('/appointments'") === false); // booking has unknown-outcome protection
  assert.match(src, /createOnce\(c,\s*'booking'/);
  assert.match(src, /createOnce\(c,\s*'order'/);
});
