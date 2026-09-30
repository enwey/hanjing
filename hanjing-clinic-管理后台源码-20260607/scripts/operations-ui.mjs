import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { preview } from 'vite';

// Test-only API fixtures live in an isolated browser, not in the application.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await preview({ root, build: { outDir: process.env.UI_TEST_DIST || 'dist' }, preview: { host: '127.0.0.1', port: 4178, strictPort: false, open: false } });
let browser;
let page;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failSettings = false, failStats = false, refundStatus = 'pending';
  const user = { id: 1, name: 'UI test', username: 'test', role_code: 'super_admin', permissions: ['*'] };
  await page.route('**/api/**', async route => {
    const p = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': '*' } });
      return;
    }
    let data = [], message = 'ok', status = 200;
    if (p === '/api/admin/login') data = { token: 'TEST-ONLY', user };
    else if (p === '/api/admin/me') data = user;
    else if (p === '/api/admin/notifications/stats') data = {};
    else if (p === '/api/admin/settings') {
      if (failSettings) { status = 503; message = 'Test unavailable'; }
      data = { deposit_amount: 0, require_deposit: true, enable_distribution: false, booking_interval: 30 };
    } else if (p === '/api/admin/roles') data = [{ id: 99, name: '测试角色', members_count: 42, permissions: ['dashboard'], status: 'active' }];
    else if (p === '/api/admin/dashboard/stats') {
      if (failStats) { status = 503; message = 'Test unavailable'; }
      data = { totalRevenue: 12500, totalAppointments: 2, totalPatients: 1, visitRate: '50%', periodLabel: '本月',
        trends: { revenue: { trend: '无可比基数', trendType: 'neutral' } }, departments: [], appointmentTrends: [], revenueTrends: [] };
    } else if (p === '/api/admin/reports/store') data = { months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1,
      net: 8000, receipts: 10000, refunds: 2000, rating: null, appointments: 2, visits: 1, doctors: [] })) };
    else if (p === '/api/admin/stores/1') data = { name: '测试门店' };
    else if (p === '/api/admin/orders/refunds') data = [{ id: 1, refundNo: 'HJR1', orderNo: 'TEST-O1', patient: '测试用户',
      product: '测试商品', amount: 10000, commissionTotal: 750, status: refundStatus, payMethod: 'wechat', applyTime: '2026-09-01 10:00:00' }];
    else if (p === '/api/admin/orders/1/refund') { refundStatus = 'processing'; data = { status: 'refunding' }; message = '退款已提交，尚未确认成功'; }
    else if (p === '/api/admin/orders/1/refund-sync') { refundStatus = 'approved'; data = { status: 'SUCCESS' }; message = '支付渠道已确认退款成功'; }
    else if (p === '/api/admin/orders/1/tracking') data = { steps: [], message: '尚未接入物流轨迹服务' };
    else if (p === '/api/admin/orders/1') data = { id: 1, order_no: 'TEST-O1', status: 'shipped', type: 'online',
      user_id: 1, user_name: '测试用户', user_phone: '13800138000', pay_amount: 10000, total_amount: 10000,
      pay_at: '2026-09-01 10:00:00', created_at: '2026-09-01 09:00:00', updated_at: '2026-09-01 11:00:00',
      shipping_address: { express_company: '承运商', tracking_number: 'REAL123' }, invoice_info: { invoice_no: 'LEGACY' }, items: [] };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, data, message }) });
  });
  await page.goto(origin + '/login');
  await page.getByPlaceholder('请输入管理员账号').fill('test');
  await page.getByPlaceholder('请输入密码').fill('test');
  assert.equal(await page.getByText('获取验证码').count(), 0);
  await page.getByRole('button', { name: '立即登录' }).click();
  await page.getByText('¥125.00', { exact: true }).waitFor();
  assert.equal(await page.getByText('↓ 无可比基数', { exact: true }).count(), 0);
  console.log('PASS: password login and dashboard response');

  await page.goto(origin + '/settings');
  await page.getByText('测试角色', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '保存设置' }).isEnabled(), true);
  assert.match(await page.locator('body').innerText(), /42/);
  assert.ok((await page.locator('input[type=number]').evaluateAll(nodes => nodes.map(n => n.value))).includes('0'));
  failSettings = true;
  await page.getByRole('button', { name: '重新加载' }).click();
  await page.getByText('加载系统设置失败', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '保存设置' }).isDisabled(), true);
  console.log('PASS: persisted zero, real roles and failed-load save guard');

  await page.goto(origin + '/store/report/1');
  await page.getByText('¥80.00', { exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /实收 ¥100.00.*已确认退款 ¥20.00/);
  await page.screenshot({ path: path.join(os.tmpdir(), 'hanjing-operations-report-desktop.png'), fullPage: true });
  console.log('PASS: receipts minus refunds in store report');

  await page.goto(origin + '/order/refund');
  await page.getByText('订单关联佣金：¥7.50', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /15%|5%|1-3个工作日/);
  const approvalResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/orders/1/refund' && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '通过', exact: true }).first().click();
  await approvalResponse;
  await page.locator('.filter-tab').filter({ hasText: '退款处理中' }).click();
  await page.getByRole('button', { name: '查询退款结果' }).waitFor();
  assert.equal(await page.getByText('已确认退款', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '查询退款结果' }).click();
  await page.getByText('已退款', { exact: true }).first().click();
  await page.getByText('已确认退款', { exact: true }).waitFor();
  console.log('PASS: refund only succeeds after provider confirmation');

  await page.goto(origin + '/order/detail/1');
  await page.getByText('尚未接入物流轨迹服务', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '开具电子发票' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '打印电子发票' }).count(), 0);
  assert.match(await page.locator('body').innerText(), /历史开票信息尚未验证/);
  await page.screenshot({ path: path.join(os.tmpdir(), 'hanjing-operations-order-desktop.png'), fullPage: true });
  console.log('PASS: no fake invoice or tracking');

  failStats = true;
  await page.goto(origin + '/dashboard');
  await page.getByText(/统计加载失败/).first().waitFor();
  assert.equal(await page.getByText('¥125.00', { exact: true }).count(), 0);
  assert.equal(await page.getByText('¥0', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: no stale dashboard values and no runtime errors');
} catch (error) {
  if (page) {
    console.error('PAGE:', page.url(), await page.locator('body').innerText());
    await page.screenshot({ path: path.join(os.tmpdir(), 'hanjing-operations-failure.png'), fullPage: true });
  }
  throw error;
} finally {
  if (browser) await browser.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
