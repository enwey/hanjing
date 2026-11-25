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
for (const name of ['order/detail', 'appointment/detail', 'appointment/success', 'distribution/withdraw-records/index']) {
  assert.doesNotMatch(read(pages + name + '.wxml'), /bind(?::)?tap="subscribe/);
}
for (const name of ['order/detail', 'product/detail', 'distribution/withdraw/index']) {
  assert.match(read(pages + name + '.js'), /subscribe.requestSubscribe/);
}
for (const name of ['appointment/detail', 'appointment/booking/index', 'appointment/reschedule']) {
  assert.match(read(pages + name + '.js'), /subscribe.recordAcceptedVisitReminder/);
}
assert.doesNotMatch(read(pages + 'appointment/success.js'), /requestVisitReminderAuthorization|subscribeVisitReminder/);
const invite = read(pages + 'distribution/invite/index.js');
assert.match(read(pages + 'distribution/invite/index.wxml'), /open-type="share" bindtap="requestPromotionReminder"/);

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
  const { refreshSubscribeSettings, requestSubscribe, requestVisitReminderAuthorization, recordAcceptedVisitReminder } = context.module.exports;
  const options = { force: true, scene: 'appointment' };
  await refreshSubscribeSettings();
  await requestSubscribe(options);
  assert.deepEqual(invocations, []);

  response = { visit_reminder: 'new-template' };
  await refreshSubscribeSettings();
  const result = requestSubscribe(options);
  assert.deepEqual(invocations, ['new-template'], '微信 API 应在点击处理函数的同步阶段调用');
  assert.equal((await result)['new-template'], 'accept');
  const templateId = await requestVisitReminderAuthorization();
  assert.equal(templateId, 'new-template');
  assert.equal(await recordAcceptedVisitReminder('42', templateId, () => false), false);
  assert.deepEqual(authorizations, []);
  assert.equal(await recordAcceptedVisitReminder('42', templateId, () => true), true);
  assert.deepEqual(authorizations, [['42', 'new-template']]);

  response = {};
  await refreshSubscribeSettings();
  await requestSubscribe(options);
  assert.equal(invocations.length, 2, '停用后不应继续使用旧模板');
}

async function checkInviteSubscription() {
  let generation = 1;
  let page;
  let resolveNative;
  const calls = [];
  const dependencies = {
    'session-store': { getLoginGeneration: () => generation },
    subscribe: { requestSubscribe: options => {
      calls.push(['prompt', options.scene]);
      return new Promise(resolve => { resolveNative = resolve; });
    } },
    'invite-design': { copy: {} },
    'invite-service': { loadInviteShareInfo: async () => ({ inviteCode: 'TEST-CODE', sharePath: '/pages/index/index?code=TEST-CODE' }) },
  };
  vm.runInNewContext(invite, {
    require: name => dependencies[name.split('/').at(-1)] || {},
    Page: config => { page = config; },
    wx: { showLoading() {}, hideLoading() {}, showToast() {}, requestSubscribeMessage() {} },
  });
  page.setData = patch => Object.assign(page.data, patch);
  page.prepareInviteImage = async () => 'poster.png';
  page.ensureAlbumPermission = async () => {};
  page.showPosterSavedNotice = async () => {};
  page.savePosterImage = async path => { calls.push(['saved', path]); };
  await page.loadInviteInfo();
  const saving = page.handleSavePoster();
  assert.deepEqual(calls, [['prompt', 'distribution']]);
  assert.equal(page.onShareAppMessage().path, '/pages/index/index?code=TEST-CODE');
  const sharing = page.requestPromotionReminder();
  resolveNative({ reminder: 'reject' });
  await Promise.all([saving, sharing]);
  assert.deepEqual(calls, [['prompt', 'distribution'], ['saved', 'poster.png']]);
  await page.requestPromotionReminder();
  assert.equal(calls.length, 2);
  generation++;
  await page.requestPromotionReminder();
  assert.equal(calls.length, 2);
  await page.loadInviteInfo();
  const next = page.requestPromotionReminder();
  assert.deepEqual(calls.at(-1), ['prompt', 'distribution']);
  resolveNative(null);
  await next;
  page.data.isDistributor = true;
  await page.requestPromotionReminder();
  assert.equal(calls.length, 3);
}

async function checkAppointmentSubscription({ paid, decision = 'accept', template = 'visit-template', saveFails = false, createFails = false, paymentFails = false }) {
  let page;
  let paymentModal;
  let payment;
  let nativePrompt;
  let finishCreation;
  const calls = [];
  const wx = {
    showToast() {}, showLoading() {}, hideLoading() {}, removeStorageSync() {},
    showModal: options => { paymentModal = options; },
    reLaunch: options => calls.push(['navigate', options.url]),
    requestPayment: options => { payment = options; },
    requestSubscribeMessage: options => {
      calls.push(['prompt', options.tmplIds[0]]);
      nativePrompt = options;
    },
  };
  const module = { exports: {} };
  const api = {
    createAppointment: () => {
      calls.push(['create']);
      if (createFails) return Promise.reject(new Error('提交失败'));
      return new Promise(resolve => { finishCreation = resolve; });
    },
    payAppointmentDeposit: async () => ({ package: 'prepay_id=fixture' }),
    confirmAppointmentPayment: async id => { calls.push(['sync', id]); },
    recordVisitReminderAuthorization: async (id, templateId) => {
      calls.push(['record', id, templateId]);
      if (saveFails) throw new Error('保存失败');
    },
  };
  const logs = { warn() {} };
  vm.runInNewContext(subscribe, { module, require: () => api, wx, console: logs });
  const dependencies = {
    'index': api, 'subscribe': module.exports,
    'appointment-draft-store': { clearDraft() {} },
    'stack-navigation': { openFromHome: url => calls.push(['navigate', url]) },
    'session-store': { isLoggedIn: () => true, getLoginGeneration: () => 1 },
    'appointment-payment-receipt': {
      acquire: () => () => {}, hasSubmitted: () => false,
      preparePayment: api.payAppointmentDeposit,
      markSubmitted: () => calls.push(['receipt']),
    },
  };
  vm.runInNewContext(read(pages + 'appointment/confirm.js'), {
    require: name => dependencies[name.split('/').at(-1)],
    Page: definition => { page = definition; },
    wx, console: logs, setTimeout: fn => fn(),
  });
  page.setData = patch => Object.assign(page.data, patch);
  Object.assign(page.data, {
    draft: { storeId: 1, doctorId: 2, scheduleId: 3, appointmentDate: '2026-12-01', timeSlot: { label: '09:00-09:30' } },
    memberList: [{ id: 'patient-1' }], consultFeeAmount: paid ? 100 : 0, visitReminderTemplateId: template,
  });
  const booking = page.submitAppointment();
  assert.deepEqual(calls, !paid && template ? [['prompt', template], ['create']] : [['create']]);
  if (createFails) {
    nativePrompt?.success({ [template]: decision });
    await booking;
    assert.ok(!calls.some(([action]) => action === 'record' || action === 'navigate'));
    return;
  }
  finishCreation({ id: '42', status: paid ? 'pending_payment' : 'pending' });
  if (paid) {
    await booking;
    assert.equal(typeof paymentModal?.success, 'function');
    const paying = paymentModal.success({ confirm: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof payment?.success, 'function');
    assert.equal(nativePrompt, undefined);
    if (paymentFails) {
      payment.fail({ errMsg: 'requestPayment:fail cancel' });
      await paying;
      assert.ok(!calls.some(([action]) => ['prompt', 'record', 'sync'].includes(action)));
      assert.deepEqual(calls.at(-1), ['navigate', '/pages/appointment/booking/index?tab=mine']);
      return;
    }
    payment.success();
    assert.deepEqual(calls.slice(1), template ? [['receipt'], ['prompt', template]] : [['receipt']]);
    nativePrompt?.success({ [template]: decision });
    await paying;
    assert.ok(calls.some(([action]) => action === 'sync'));
    if (calls.some(([action]) => action === 'record')) {
      assert.ok(calls.findIndex(([action]) => action === 'sync') < calls.findIndex(([action]) => action === 'record'));
    }
  } else {
    nativePrompt?.success({ [template]: decision });
    await booking;
  }
  assert.deepEqual(calls.filter(([action]) => action === 'record'), template && decision === 'accept' ? [['record', '42', template]] : []);
  assert.deepEqual(calls.at(-1), ['navigate', '/pages/appointment/success?id=42']);
}

async function checkOrderPaymentSubscription(deliveryMethod, cancelled = false) {
  let page;
  let payment;
  const calls = [];
  const wx = {
    showToast() {}, showLoading() {}, hideLoading() {},
    requestSubscribeMessage() {},
    requestPayment: options => { payment = options; },
  };
  const dependencies = {
    index: {
      payOrder: async () => ({ package: 'prepay_id=fixture' }),
      confirmOrderPayment: async () => { calls.push('confirm'); },
    },
    'session-store': { getLoginGeneration: () => 1 },
    subscribe: { requestSubscribe: async options => { calls.push(options.scene); return { shipment: 'reject' }; } },
    'order-payment': { isPaymentTimeout: () => false },
  };
  vm.runInNewContext(read(pages + 'order/detail.js'), {
    require: name => dependencies[name.split('/').at(-1)] || {},
    Page: definition => { page = definition; }, wx, console,
  });
  page.syncOrderDetailSession = () => 1;
  page.showConfirmedPayment = () => {};
  page.loadOrder = async () => {};
  page.data.order = { id: 'order-1', shippingAddress: { deliveryMethod }, actionFlags: { canPay: true } };
  const paying = page.onPayOrder();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
  if (cancelled) {
    payment.fail({ errMsg: 'requestPayment:fail cancel' });
    await paying;
    assert.deepEqual(calls, []);
    return;
  }
  payment.success();
  assert.deepEqual(calls, deliveryMethod === 'online' ? ['order'] : [],
    '发货模板仅在邮寄订单的原生支付成功回调中请求');
  await paying;
  assert.deepEqual(calls, deliveryMethod === 'online' ? ['order', 'confirm'] : ['confirm']);
}

async function checkExistingAppointmentSubscription(kind) {
  let page;
  let payment;
  const calls = [];
  const api = {
    payAppointmentDeposit: async () => ({}),
    confirmAppointmentPayment: async () => { calls.push('paid'); },
    rescheduleAppointment: async () => { calls.push('rescheduled'); },
  };
  const dependencies = {
    index: api,
    'session-store': { isLoggedIn: () => true, getLoginGeneration: () => 1 },
    subscribe: {
      requestVisitReminderAuthorization: async () => { calls.push('prompt'); return 'visit'; },
      recordAcceptedVisitReminder: async (id, template, isCurrent) => {
        assert.equal(id, '42');
        assert.equal(template, 'visit');
        assert.equal(isCurrent(), true);
        calls.push('stored');
      },
    },
    'appointment-payment-receipt': {
      acquire: () => () => {}, hasSubmitted: () => false,
      preparePayment: api.payAppointmentDeposit, markSubmitted() {},
    },
  };
  const wx = {
    showToast() {}, showLoading() {}, hideLoading() {},
    requestSubscribeMessage() {},
    requestPayment: options => { payment = options; },
  };
  vm.runInNewContext(read(pages + 'appointment/' + kind + '.js'), {
    require: name => dependencies[name.split('/').at(-1)] || {},
    Page: definition => { page = definition; }, wx, console, setTimeout() {},
  });
  page.loadPage = async () => {};
  page.setData = patch => Object.assign(page.data, patch);
  if (kind === 'reschedule') {
    Object.assign(page.data, {
      loading: false, appointmentId: '42', canRequestVisitReminder: true,
      selectedDate: '2026-12-01', scheduleDates: ['2026-12-01'],
      schedules: [{ id: 's' }], selectedScheduleId: 's',
      timeSlots: [{ id: 't', label: '09:00-09:30', selectable: true }],
      selectedTimeSlotId: 't', selectedTimeSlotLabel: '09:00-09:30',
    });
    const submitting = page.submitReschedule();
    assert.deepEqual(calls, ['prompt', 'rescheduled']);
    await submitting;
    assert.deepEqual(calls, ['prompt', 'rescheduled', 'stored']);
    return;
  }
  Object.assign(page.data, { appointmentId: '42', canPay: true, canRequestVisitReminderOnPayment: true });
  const paying = kind === 'detail' ? page.payDeposit() :
    page.handlePrimaryAction({ detail: { id: '42', status: 'pending_payment' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
  payment.success();
  assert.deepEqual(calls, ['prompt']);
  await paying;
  assert.deepEqual(calls, ['prompt', 'paid', 'stored']);
}

Promise.all([checkConfigRecovery(new Error('offline')), checkConfigRecovery({}), checkInviteSubscription(),
  checkAppointmentSubscription({ paid: false }),
  checkAppointmentSubscription({ paid: false, decision: 'reject' }),
  checkAppointmentSubscription({ paid: false, createFails: true }),
  checkAppointmentSubscription({ paid: true }),
  checkAppointmentSubscription({ paid: true, saveFails: true }),
  checkAppointmentSubscription({ paid: true, paymentFails: true }),
  checkAppointmentSubscription({ paid: true, template: '' }),
  checkOrderPaymentSubscription('online'),
  checkOrderPaymentSubscription('pickup'),
  checkOrderPaymentSubscription('online', true),
  checkExistingAppointmentSubscription('detail'),
  checkExistingAppointmentSubscription('booking/index'),
  checkExistingAppointmentSubscription('reschedule'),
]).then(() => {
  console.log('wechat notification trigger and config recovery checks passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
