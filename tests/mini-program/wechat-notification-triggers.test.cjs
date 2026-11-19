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

const pages = 'mp-weixin-rewrite/pages/';
for (const name of ['distribution/withdraw/index', 'appointment/confirm', 'appointment/booking/index', 'product/detail']) {
  assert.doesNotMatch(read(pages + name + '.js'), /requestSubscribe\(|subscribeToVisitReminder\(|subscribeToUpdates\(/);
}
const order = read(pages + 'order/detail.js');
assert.match(order, /canSubscribeShipment: order.status === 'shipping'/);
assert.match(order, /subscribeToUpdates\('order'/);
assert.doesNotMatch(order.slice(order.indexOf('async onPayOrder()')), /requestSubscribe\(|subscribeToUpdates\(/);
assert.match(read(pages + 'order/detail.wxml'), /wx:if="{{order.canSubscribeShipment}}"[^>]+bindtap="subscribeShipment"/);
const appointmentSuccess = read(pages + 'appointment/success.js');
assert.match(appointmentSuccess, /\['pending', 'confirmed'\]\.includes\((?:resultAppointment|appointment).status\)/);
const appointmentDetail = read(pages + 'appointment/detail.js');
assert.doesNotMatch(appointmentDetail.slice(appointmentDetail.indexOf('async payDeposit()')), /subscribeToVisitReminder\(/);
assert.match(read(pages + 'appointment/success.wxml'), /wx:if="{{canSubscribeVisitReminder}}"[^>]+bind:tap="subscribeVisitReminder"/);
const withdrawRecords = read(pages + 'distribution/withdraw-records/index.js');
assert.match(withdrawRecords, /subscribeToUpdates\(this.data.withdrawSubscribeScene/);
assert.match(read(pages + 'distribution/withdraw-records/index.wxml'), /wx:if="{{withdrawSubscribeScene}}"[^>]+bindtap="subscribeWithdrawUpdates"/);
const invite = read(pages + 'distribution/invite/index.js');
assert.match(invite, /!this.data.inviteCode \|\| this.data.isDistributor/);
assert.doesNotMatch(read(pages + 'distribution/invite/index.wxml'), /open-type="share"[^>]+bindtap=/);

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
  assert.equal(invocations.length, 2, '停用后不应继续使用旧模板');
}

async function checkInviteSubscription() {
  let generation = 1;
  let page;
  const calls = [];
  const dependencies = {
    'session-store': { getLoginGeneration: () => generation },
    subscribe: { subscribeToUpdates: async scene => calls.push(scene) },
    'invite-design': { copy: {} },
    'invite-service': { loadInviteShareInfo: async () => ({ inviteCode: 'TEST-CODE' }) },
  };
  vm.runInNewContext(invite, {
    require: name => dependencies[name.split('/').at(-1)] || {},
    Page: config => { page = config; },
    wx: { showLoading() {}, hideLoading() {}, showToast() {} },
  });
  page.setData = patch => Object.assign(page.data, patch);
  page.prepareInviteImage = async () => 'poster.png';
  page.ensureAlbumPermission = async () => {};
  page.showPosterSavedNotice = async () => {};
  await page.loadInviteInfo();
  await page.subscribePromotionActivation();
  page.savePosterImage = async () => { throw Error('保存失败'); };
  await page.handleSavePoster();
  assert.equal(page.data.activationSubscribeSource, '');
  assert.deepEqual(calls, []);
  let finishSave;
  page.savePosterImage = () => new Promise(resolve => { finishSave = resolve; });
  const saving = page.handleSavePoster();
  for (let i = 0; i < 8 && !finishSave; i++) await Promise.resolve();
  assert.equal(page.data.activationSubscribeSource, '');
  finishSave();
  await saving;
  assert.equal(page.data.activationSubscribeSource, 'saved');
  assert.deepEqual(calls, []);
  await page.subscribePromotionActivation();
  assert.deepEqual(calls, ['distribution']);
  generation++;
  await page.subscribePromotionActivation();
  await page.loadInviteInfo();
  assert.equal(page.data.activationSubscribeSource, '');
  page.onShareAppMessage();
  assert.equal(page.data.activationSubscribeSource, 'share');
  assert.deepEqual(calls, ['distribution']);
  await page.loadInviteInfo();
  assert.equal(page.data.activationSubscribeSource, 'share');
  await page.subscribePromotionActivation();
  assert.deepEqual(calls, ['distribution', 'distribution']);
  page.data.isDistributor = true;
  await page.subscribePromotionActivation();
  assert.equal(calls.length, 2);
}

Promise.all([checkConfigRecovery(new Error('offline')), checkConfigRecovery({}), checkInviteSubscription()]).then(() => {
  console.log('wechat notification trigger and config recovery checks passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
