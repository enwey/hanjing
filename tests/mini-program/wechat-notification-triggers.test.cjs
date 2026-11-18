const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const subscribe = read('mp-weixin-rewrite/common/utils/subscribe.js');
assert.match(subscribe, /appointment:\s*\['visit_reminder'\]/);
assert.match(subscribe, /withdraw:\s*\['withdraw_result', 'withdraw_paid'\]/);
assert.match(subscribe, /order:\s*\['order_shipped'\]/);
assert.match(subscribe, /distribution:\s*\['promoter_activated'\]/);

const withdraw = read('mp-weixin-rewrite/pages/distribution/withdraw/index.js');
assert.match(withdraw, /scene: 'withdraw'[\s\S]*await api\.applyWithdraw\(/);

const appointment = read('mp-weixin-rewrite/pages/appointment/confirm.js');
assert.match(appointment, /scene: 'appointment'[\s\S]*await api\.createAppointment\(/);

const product = read('mp-weixin-rewrite/pages/product/detail.js');
assert.match(product, /scene: 'order'[\s\S]*await api\.createOrder\(/);
assert.match(read('mp-weixin-rewrite/pages/order/detail.js'), /scene: 'order'[\s\S]*await api\.payOrder\(/);

const invite = read('mp-weixin-rewrite/pages/distribution/invite/index.js');
assert.match(invite, /if \(this\.data\.isDistributor\) return;[\s\S]*scene: 'distribution'/);

const admin = read('hanjing-clinic-backend/routes/admin.js');
for (const event of ['withdraw_result', 'withdraw_paid', 'order_shipped', 'promoter_activated']) {
  assert.match(admin, new RegExp(`event: '${event}'`));
}

const client = read('hanjing-clinic-backend/routes/client.js');
assert.match(client, /payAmount === 0[\s\S]*pay_at = CURRENT_TIMESTAMP/);
assert.match(client, /event: 'promoter_activated'/);

async function checkConfigRecovery(initial) {
  let response = initial;
  const invocations = [];
  const authorizations = [];
  const context = {
    module: { exports: {} },
    require: () => ({
      getBookingSettings: async () => {
        if (response instanceof Error) throw response;
        return { data: { subscribeTemplateMap: response } };
      },
      recordVisitReminderAuthorization: async (appointmentId, templateId) => {
        authorizations.push([appointmentId, templateId]);
      },
    }),
    wx: {
      requestSubscribeMessage: ({ tmplIds, success }) => {
        invocations.push(...tmplIds);
        success({ [tmplIds[0]]: 'accept' });
      },
    },
  };
  vm.runInNewContext(subscribe, context);
  const { refreshSubscribeSettings, requestSubscribe, subscribeToVisitReminder } = context.module.exports;
  const options = { force: true, scene: 'appointment' };
  await refreshSubscribeSettings();
  await requestSubscribe(options);
  assert.deepEqual(invocations, []);

  response = { visit_reminder: 'new-template' };
  await refreshSubscribeSettings();
  const result = requestSubscribe(options);
  assert.deepEqual(invocations, ['new-template'], '微信 API 应在点击处理函数的同步阶段调用');
  assert.equal((await result)['new-template'], 'accept');
  assert.equal(await subscribeToVisitReminder('42', () => false), false);
  assert.deepEqual(authorizations, []);
  assert.equal(await subscribeToVisitReminder('42', () => true), true);
  assert.deepEqual(authorizations, [['42', 'new-template']]);

  response = {};
  await refreshSubscribeSettings();
  await requestSubscribe(options);
  assert.equal(invocations.length, 3, '停用后不应继续使用旧模板');
}

Promise.all([checkConfigRecovery(new Error('offline')), checkConfigRecovery({})]).then(() => {
  console.log('wechat notification trigger and config recovery checks passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
