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
  const product = { id: 1, name: 'Stock fixture', category: 'device', price: 10000, stock: 19, status: 'on', image_url: '', gallery_urls: [] };
  const productWrites = [];
  const patientWrites = [];
  let failRegistrationStores = false;
  const user = { id: 1, name: 'UI test', username: 'test', role_code: 'super_admin', permissions: ['*'] };
  await page.route('**/api/**', async route => {
    const p = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': '*' } });
      return;
    }
    let data = [], message = 'ok', status = 200, pagination;
    const params = new URL(route.request().url()).searchParams;
    if (p === '/api/admin/login') data = { token: 'TEST-ONLY', user };
    else if (p === '/api/admin/patients/registration-stores') {
      if (failRegistrationStores) { status = 503; message = 'Store lookup unavailable'; }
      else data = [{ id: 1, name: '建档门店一' }, { id: 2, name: '建档门店二' }];
    }
    else if (p === '/api/admin/patients') {
      if (route.request().method() === 'POST') {
        patientWrites.push(route.request().postDataJSON());
        data = { id: 99, ...patientWrites.at(-1) };
      } else data = { list: [], pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 } };
    }
    else if (p === '/api/admin/products/1') {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON();
        productWrites.push(payload);
        if ('stock' in payload && payload.expected_stock !== product.stock) {
          status = 409; message = '库存已变动，请刷新并核对后重新修改';
        } else Object.assign(product, payload);
      }
      data = { ...product };
    }
    else if (p === '/api/admin/products') data = [{ ...product }];
    else if (p === '/api/admin/product-categories') data = [{ id: 1, code: 'device', name: 'Device', sort_order: 1 }];
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
    else if (p === '/api/admin/orders/cashier-stores') data = [{id:1,name:'测试收款门店'}];
    else if (p === '/api/admin/fulfillment/technicians') data = [{id:1,name:'测试技师'}];
    else if (p === '/api/admin/fulfillment/cases') {
      const current=Number(params.get('page')||1), size=Number(params.get('pageSize')||50);
      const all=Array.from({length:51},(_,i)=>({id:i+1,patient_name:'患者'+(i+1),patient_no:'P'+(i+1),order_no:'ORDER'+(i+1),status:'assigned',devices:[]}));
      const filtered=params.get('search')?all.filter(x=>x.order_no===params.get('search')):all;
      data=filtered.slice((current-1)*size,current*size);pagination={page:current,pageSize:size,total:filtered.length};
    } else if (p === '/api/admin/fulfillment/batches') {
      const current=Number(params.get('page')||1);
      const all=Array.from({length:51},(_,i)=>({id:i+1,batch_no:'BATCH'+(i+1),factory_name:'测试工厂',status:'draft',item_count:1,returned_count:0,retake_count:0}));
      data=all.slice((current-1)*50,current*50);pagination={page:current,pageSize:50,total:51};
    } else if (p === '/api/admin/fulfillment/ready-molds') {
      const current=Number(params.get('page')||1);
      const all=Array.from({length:51},(_,i)=>({id:i+1,patient_name:'患者'+(i+1),mold_no:'MOLD'+(i+1),details:{taken_date:'2026-10-15'}}));
      data=all.slice((current-1)*50,current*50);pagination={page:current,pageSize:50,total:51};
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, data, message, pagination }) });
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
  assert.equal(await page.getByRole('button',{name:'清理测试数据'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'初始化演示数据'}).count(),0);
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

  await page.goto(origin + '/appointment/checkout');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(x=>x.value==='测试收款门店'));
  assert.ok(await page.locator('input').evaluateAll(nodes=>nodes.some(x=>x.value==='微信收款码')));
  await page.screenshot({path:path.join(os.tmpdir(),'hanjing-ops-checkout.png'),fullPage:true});
  console.log('PASS: checkout defaults to real-channel payment and selects an authorized store');

  await page.goto(origin + '/fulfillment');
  await page.getByText('ORDER1',{exact:false}).first().waitFor();
  await page.locator('.t-pagination__number').filter({hasText:/^2$/}).click();
  await page.getByText('订单：ORDER51',{exact:true}).waitFor();
  assert.equal(await page.getByText('订单：ORDER1',{exact:true}).count(),0);
  await page.getByLabel('搜索履约单').fill('ORDER1');
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await page.getByText('订单：ORDER1',{exact:true}).waitFor();
  await page.screenshot({path:path.join(os.tmpdir(),'hanjing-ops-fulfillment.png'),fullPage:false});
  await page.getByRole('button',{name:'送厂批次',exact:true}).click();
  await page.getByText('BATCH1',{exact:true}).waitFor();
  await page.locator('.t-pagination__number').filter({hasText:/^2$/}).click();
  await page.getByText('BATCH51',{exact:true}).waitFor();
  await page.getByRole('button',{name:'汇总口模 / 新建批次'}).click();
  const dialog=page.locator('.t-dialog').filter({hasText:'汇总待送厂口模'});
  await dialog.getByText('MOLD1',{exact:true}).waitFor();
  await dialog.locator('tbody input[type=checkbox]').first().check();
  await dialog.locator('.t-pagination__number').filter({hasText:/^2$/}).click();
  await dialog.getByText('MOLD51',{exact:true}).waitFor();
  await dialog.locator('tbody input[type=checkbox]').first().check();
  await dialog.getByText('已选择 2 件',{exact:true}).waitFor();
  await page.screenshot({path:path.join(os.tmpdir(),'hanjing-ops-batch.png'),fullPage:false});
  console.log('PASS: case search, batch pagination and mold selection across pages');

  await page.goto(origin + '/after-sales');
  await page.getByRole('button',{name:'新建售后工单'}).click();
  const afterSales=page.locator('.t-dialog').filter({hasText:'新建售后工单'});
  await afterSales.getByPlaceholder('患者、档案号、订单号').fill('ORDER51');
  await afterSales.getByRole('button',{name:'搜索',exact:true}).click();
  await afterSales.locator('option').filter({hasText:'ORDER51'}).waitFor({state:'attached'});
  await page.screenshot({path:path.join(os.tmpdir(),'hanjing-ops-after-sales.png'),fullPage:false});
  console.log('PASS: old fulfillment can be found from after-sales');

  await page.goto(origin + '/products/edit/1');
  const stockInput = page.getByPlaceholder('请输入库存', { exact: true });
  await page.waitForFunction(() => document.querySelector('input[placeholder="请输入库存"]')?.value === '19');
  product.stock = 18;
  await page.getByPlaceholder('请输入商品名称，如：智能睡眠呼吸机').fill('Name only');
  let saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/products/1' && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存并发布' }).click();
  assert.equal((await saved).status(), 200);
  assert.equal('stock' in productWrites.at(-1), false);
  assert.equal(product.stock, 18);
  await page.waitForURL(origin + '/products');
  await page.goto(origin + '/products/edit/1');
  await page.waitForFunction(() => document.querySelector('input[placeholder="请输入库存"]')?.value === '18');
  await stockInput.fill('25');
  product.stock = 17;
  saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/products/1' && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存并发布' }).click();
  assert.equal((await saved).status(), 409);
  assert.equal(productWrites.at(-1).expected_stock, 18);
  assert.equal(product.stock, 17);
  assert.match(page.url(), /\/products\/edit\/1$/);
  assert.equal(await stockInput.inputValue(), '25');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('input[placeholder="请输入库存"]')?.value === '17');
  await stockInput.fill('25');
  saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/products/1' && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存并发布' }).click();
  assert.equal((await saved).status(), 200);
  assert.equal(productWrites.at(-1).expected_stock, 17);
  assert.equal(product.stock, 25);
  console.log('PASS: name-only edits omit stock; manual stock edits detect conflicts and can be retried after reload');

  await page.goto(origin + '/patient');
  await page.getByRole('button', { name: '手动建档' }).click();
  const patientDialog = page.locator('.t-dialog').filter({ hasText: '新患者建档' });
  await patientDialog.getByPlaceholder('请输入患者姓名').fill('首诊测试');
  await patientDialog.getByPlaceholder('请输入11位手机号').fill('13800000987');
  const storeSelect = patientDialog.locator('select').first();
  await storeSelect.locator('option').filter({ hasText: '建档门店二' }).waitFor({ state: 'attached' });
  await patientDialog.getByRole('button', { name: '确认建档', exact: true }).click();
  assert.equal(patientWrites.length, 0);
  await storeSelect.selectOption('2');
  const patientSaved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/patients' && r.request().method() === 'POST');
  await patientDialog.getByRole('button', { name: '确认建档', exact: true }).click();
  assert.equal((await patientSaved).status(), 200);
  assert.equal(patientWrites[0].store_id, 2);
  await patientDialog.waitFor({ state: 'hidden' });
  failRegistrationStores = true;
  await page.getByRole('button', { name: '手动建档' }).click();
  await page.getByText('无法获取建档门店，请关闭后重试', { exact: true }).waitFor();
  assert.equal(await storeSelect.inputValue(), '');
  await patientDialog.getByRole('button', { name: '确认建档', exact: true }).click();
  assert.equal(patientWrites.length, 1);
  await page.screenshot({ path: path.join(os.tmpdir(), 'hanjing-patient-registration.png'), fullPage: false });
  await patientDialog.getByRole('button', { name: '取消', exact: true }).click();
  console.log('PASS: registration requires an authorized store, sends its ID, and clears stale choices after lookup failure');

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
