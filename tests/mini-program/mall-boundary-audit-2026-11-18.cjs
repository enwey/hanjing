const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const previous = fs.readFileSync(__dirname + '/mall-full-audit-2026-11-18.cjs', 'utf8');
const harnessContext = { require, __dirname, module: { exports: {} }, setImmediate };
vm.runInNewContext(
  previous.slice(0, previous.indexOf('const results = ')) + '\nmodule.exports={harness,deferred,turn,timeout,order};',
  harnessContext,
);
const { harness, deferred, turn, timeout, order } = harnessContext.module.exports;
const results = [];

async function check(name, run) {
  try {
    await run();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}

const requestError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const fillCheckout = page => Object.assign(page.data, {
  product: { id: 7, price: 1000 }, quantity: 1, contactName: '测试收货人',
  phone: '13800138001', detailAddress: '测试地址', showCheckout: true,
});

function orderRoutes(expired) {
  const source = fs.readFileSync(__dirname + '/../../hanjing-clinic-backend/routes/client.js', 'utf8');
  function segment(start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.ok(startIndex >= 0 && endIndex > startIndex);
    return source.slice(startIndex, endIndex);
  }
  const code = [
    segment('export async function cancelPendingProductOrder', '// 11. WECHAT MINI PROGRAM API').replace(/^export /, ''),
    segment("app.get('/api/v1/orders',", "app.get('/api/v1/orders/:id/logistics',"),
  ].join('\n');
  const routes = new Map(), scheduled = [], warnings = [];
  const current = { id: 21, user_id: 5, status: 'shipping', order_no: 'FIXTURE21', shipping_address: '{}' };
  const old = { id: 19, user_id: 5, status: 'pending', pay_method: 'wechat', wechat_prepay_id: 'REQUESTING', order_no: 'FIXTURE19' };
  vm.runInNewContext(code, {
    app: { get: (key, _, handler) => routes.set(key, handler) },
    authenticateWxToken() {},
    get: async (_, args) => Number(args[0]) === current.id ? current : null,
    query: async (sql, args) => sql.includes('DATE_SUB')
      ? (expired && (args.length === 1 || Number(args[1]) === old.id) ? [old] : [])
      : sql.includes('FROM order_items') ? [] : [current],
    transaction: callback => callback({ execute: async sql => {
      if (sql.includes('SELECT appointment_id')) return [[{}]];
      if (sql.includes('SELECT * FROM orders')) return [[old]];
      assert.fail('支付查询超时后，不应写入订单');
    } }),
    queryOrderByOutTradeNo: async () => { throw timeout(); },
    closeOrderByOutTradeNo: async () => assert.fail('没有查到支付状态时不应尝试关单'),
    setImmediate: callback => scheduled.push(callback),
    console: { error() {}, warn: (...args) => warnings.push(args) },
  });
  const read = async key => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(key)({ params: { id: 21 }, query: {}, user: { id: 5 } }, response);
    return response;
  };
  return { read, scheduled, warnings };
}

async function inventoryConflict() {
  const source = fs.readFileSync(__dirname + '/../../hanjing-clinic-backend/routes/client.js', 'utf8');
  const start = source.indexOf("app.post('/api/v1/orders',");
  const end = source.indexOf("app.post('/api/v1/orders/:id/pay'", start);
  let handler;
  let committed = false;
  let rolledBack = false;
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_, __, action) => { handler = action; } },
    authenticateWxToken() {},
    console: { error() {} },
    syncUserMemberLevel: async () => ({ member_level: 'normal' }),
    getMemberDiscountRate: () => 1,
    query: async () => [{ id: 7, name: '商品', price: 1000, stock: 1, status: 'on' }],
    crypto: { randomBytes: () => ({ toString: () => 'fixture' }) },
    businessError: (message, statusCode) => requestError(statusCode, message),
    transaction: async callback => {
      try {
        const result = await callback({ execute: async sql => [
          sql.includes('UPDATE products SET stock') ? { affectedRows: 0 } : { insertId: 21 },
        ] });
        committed = true;
        return result;
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  });
  const out = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handler({ user: { id: 5 }, body: {
    items: [{ productId: 7, quantity: 1 }],
    shippingAddress: { contactName: '测试收货人', phone: '13800138001', detailAddress: '测试地址' },
  } }, out);
  assert.equal(out.statusCode, 409);
  assert.match(out.body.message, /库存或价格已变更/);
  assert.equal(out.body.reason, 'ORDER_INVENTORY_CONFLICT');
  assert.equal(rolledBack, true);
  assert.equal(committed, false);
  return out.body;
}

(async () => {
  for (const statusCode of [404, 408]) {
    await check('已加载商品刷新 ' + statusCode, async () => {
      let loaded = false;
      const h = harness('product/detail', {
        getProductDetail: async () => {
          if (loaded) throw requestError(statusCode, statusCode === 404 ? '商品不存在' : '请求超时');
          loaded = true;
          return { data: { id: 7, name: '商品', price: 1000 } };
        },
        getMemberInfo: async () => null,
      });
      await h.page.loadProduct(7);
      h.page.data.showCheckout = true;
      await h.page.loadProduct(7, { silent: true });
      assert.equal(h.page.data.product?.id, statusCode === 404 ? undefined : '7',
        '刷新明确返回商品不存在后仍保留可结算的旧商品');
      assert.equal(h.page.data.showCheckout, statusCode !== 404);
      if (statusCode === 404) assert.equal(h.page.data.loadError, '商品不存在');
    });
  }
  let conflictBody;
  await check('实际后端库存条件更新失败时返回可识别的 409 并走事务回滚', async () => {
    conflictBody = await inventoryConflict();
  });
  for (const [statusCode, confirmedRollback] of [[400, false], [409, true], [409, false], [408, false]]) {
    await check('建单失败后再次提交 ' + statusCode + (confirmedRollback ? ' 确认回滚' : ''), async () => {
      let requests = 0;
      const h = harness('product/detail', {
        createOrder: async () => {
          requests++;
          if (requests === 1) {
            const error = requestError(statusCode, '测试建单失败');
            if (confirmedRollback) error.data = conflictBody;
            throw error;
          }
          return { data: { id: 21, payAmount: 0 } };
        },
      });
      fillCheckout(h.page);
      await h.page.submitOrder();
      await h.page.submitOrder();
      assert.equal(requests, statusCode === 400 || confirmedRollback ? 2 : 1);
    });
  }
  for (const [route, label] of [['/api/v1/orders', '列表'], ['/api/v1/orders/:id', '详情']]) {
    for (const expired of [false, true]) {
      await check('读取订单' + label + (expired ? '，另有过期订单且微信查询超时' : '，无过期单'), async () => {
        const fixture = orderRoutes(expired);
        const response = await fixture.read(route);
        assert.equal(response.code, 200, '其他过期订单的关单查询拖垮读取接口');
        const rows = Array.isArray(response.body.data) ? response.body.data : [response.body.data];
        assert.equal(rows[0].id, '21');
        if (expired && label === '列表') {
          assert.equal(fixture.scheduled.length, 1, '列表应在微信查询执行前返回');
          await fixture.read(route);
          assert.equal(fixture.scheduled.length, 1, '重复读取不应再次排队');
          await fixture.scheduled.shift()();
          assert.equal(fixture.warnings.length, 1);
          assert.equal(fixture.warnings[0][2], '请求超时');
          assert.equal((await fixture.read(route)).code, 200);
        } else {
          assert.equal(fixture.scheduled.length, 0, '其他订单详情不应安排该过期订单关单');
        }
      });
    }
  }
  for (const status of ['shipped', 'completed']) {
    await check('物流请求挂起时可查看订单 ' + status, async () => {
      const logistics = deferred();
      const h = harness('order/detail', {
        getOrderDetail: async () => ({ data: order(status) }),
        getOrderLogistics: () => logistics.promise,
      });
      const pending = h.page.loadOrder('old-order');
      try {
        await turn();
        assert.equal(h.page.data.order?.status, status, '订单详情已返回，但页面仍等待物流');
        assert.equal(h.page.data.loading, false);
        assert.equal(h.page.data.logisticsMessage, '物流信息加载中…');
      } finally {
        logistics.resolve({ data: { steps: [], message: '暂无轨迹' } });
        await pending;
      }
      await turn();
      assert.equal(h.page.data.order.shippingAddress.tracking_number, 'TRACK001');
      assert.equal(h.page.data.logisticsMessage, '暂无轨迹');
    });
  }
  await check('旧订单物流迟到时不覆盖下一笔订单', async () => {
    const logistics = deferred();
    const h = harness('order/detail', {
      getOrderDetail: async id => ({ data: order(id === 'old-order' ? 'shipped' : 'pending', id) }),
      getOrderLogistics: () => logistics.promise,
    });
    await h.page.loadOrder('old-order');
    await h.page.loadOrder('new-order');
    logistics.resolve({ data: { steps: [{ desc: '旧订单物流' }] } });
    await turn();
    assert.equal(h.page.data.order.id, 'new-order');
    assert.equal(h.page.data.logisticsList.length, 0);
    assert.equal(h.page.data.logisticsMessage, '');
  });
  const failed = results.filter(result => result.status === 'FAIL').length;
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed, failed, results }, null, 2));
  process.exitCode = failed ? 1 : 0;
})();
