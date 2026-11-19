const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = fs.readFileSync(__dirname + '/mall-full-audit-2026-11-18.cjs', 'utf8');
const context = { require, __dirname, module: { exports: {} }, setImmediate };
vm.runInNewContext(base.slice(0, base.indexOf('const results = ')) +
  '\nmodule.exports = { harness, deferred, turn, timeout, order };', context);
const { harness, deferred, turn, timeout, order } = context.module.exports;
const results = [];

async function check(name, test) {
  try {
    await test();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}

(async () => {
  for (const code of [401, 403, 404, 408]) {
    await check(`补付超时，随后订单查询返回 ${code}`, async () => {
      let reads = 0;
      const h = harness('order/detail', {
        payOrder: async () => { throw timeout(); },
        confirmOrderPayment: async () => { throw timeout(); },
        getOrderDetail: async () => {
          if (++reads === 1) return { data: order('pending') };
          throw Object.assign(Error('无法读取订单'), { statusCode: code });
        },
      });
      await h.page.loadOrder('old-order');
      await h.page.onPayOrder();
      assert.ok(reads > 1);
      if (code === 408) {
        assert.equal(h.page.data.order.id, 'old-order');
        assert.equal(h.page.data.order.actionFlags.canPay, true);
        assert.equal(h.page.data.order.actionFlags.canCancel, true);
      } else {
        assert.equal(h.page.data.order, null, '订单已不可访问，仍显示旧订单和操作');
        assert.equal(h.page.data.loadError, '无法读取订单');
        assert.equal(h.page.data.loading, false);
      }
    });
  }
  await check('退出订单详情后迟到的物流结果不写入页面', async () => {
    const logistics = deferred();
    const h = harness('order/detail', {
      getOrderDetail: async () => ({ data: order('shipped') }),
      getOrderLogistics: () => logistics.promise,
    });
    await h.page.loadOrder('old-order');
    h.page.onUnload();
    logistics.resolve({ data: { steps: [{ desc: '迟到的物流信息' }] } });
    await turn();
    assert.equal(h.page.data.logisticsList.length, 0);
  });
  await check('新订单详情打开后旧订单物流响应被丢弃', async () => {
    const logistics = deferred();
    const h = harness('order/detail', {
      getOrderDetail: async id => ({ data: order(id === 'new' ? 'pending' : 'shipped', id) }),
      getOrderLogistics: () => logistics.promise,
    });
    await h.page.loadOrder('old-order');
    await h.page.loadOrder('new');
    logistics.resolve({ data: { steps: [{ desc: '旧订单物流' }] } });
    await turn();
    assert.equal(h.page.data.order.id, 'new');
    assert.equal(h.page.data.logisticsList.length, 0);
  });
  console.log(JSON.stringify({ total: results.length, passed: results.filter(x => x.status === 'PASS').length,
    failed: results.filter(x => x.status === 'FAIL').length, results }, null, 2));
  if (results.some(x => x.status === 'FAIL')) process.exitCode = 1;
})();
