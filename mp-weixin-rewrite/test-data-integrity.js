const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(relative, dependencies = {}, wxOverrides = {}, globals = {}) {
  const storage = new Map();
  const toasts = [];
  let page;
  const context = {
    module: { exports: {} }, console: { error() {}, log() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.endsWith('date-time')) return { formatChinaDate: value => value, formatChinaDateTime: value => value };
      if (name.endsWith('image-url')) return { normalizeImageUrl: value => value, getStoreCoverUrl: () => '' };
      if (name.endsWith('subscribe')) return { requestSubscribe: async () => {} };
      return {};
    },
    wx: {
      getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key), showToast: value => toasts.push(value),
      showLoading() {}, hideLoading() {}, reLaunch() {}, navigateTo() {}, getRecorderManager: () => ({}),
      ...wxOverrides,
    },
    Page(value) { page = value; },
    ...globals,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, relative), 'utf8'), context, { filename: relative });
  if (page) {
    page.data = structuredClone(page.data);
    page.setData = function(value, callback) { Object.assign(this.data, value); if (callback) callback(); };
  }
  return { page, storage, toasts, exports: context.module.exports };
}

test('store-channel orders cannot pay in mini-program and unpaid bills show their actual channel', () => {
  const { page } = load('pages/order/detail.js');
  for (const payMethod of ['wechat_native', 'wechat_micropay', 'cash', 'bank']) {
    assert.equal(page.normalizeOrder({ status: 'pending', payMethod }).actionFlags.canPay, false);
  }
  const order = page.normalizeOrder({ status: 'pending', payMethod: 'wechat', shippingAddress: { deliveryMethod: 'pickup_pending' } });
  assert.equal(order.actionFlags.canPay, true);
  assert.equal(order.payMethodLabel, '小程序微信支付');
  assert.equal(order.deliveryMethodText, '到店自取（待到货）');
  assert.equal(page.normalizeOrder({ status: 'paid', payMethod: 'wechat' }).actionFlags.canPay, false);
});

test('zero bank rate is preserved, fee rounding is in cents, invalid precision is rejected', async () => {
  const { page } = load('pages/distribution/withdraw/index.js', {
    '../../../api/index': { getDistributorInfo: async () => ({ availableCommission: 100000, minWithdrawAmount: 5000, withdrawFeeRates: { bank: 0 } }) },
  });
  await page.loadPage();
  page.setData({ withdrawAmountInput: '1000', bankName: 'Bank', bankAccountName: 'Test', bankAccountNo: '1234567890123456' });
  page.refreshAmountSummary();
  assert.equal(page.data.withdrawFeeRate, 0);
  assert.equal(page.data.serviceFeeLabel, '¥1.00');
  assert.equal(page.data.actualAmountLabel, '¥999.00');
  assert.equal(Boolean(page.data.isSubmitEnabled), true);
  page.setData({ withdrawFeeRate: 0.0123, withdrawAmountInput: '123.45' });
  page.refreshAmountSummary();
  assert.equal(page.data.serviceFeeLabel, '¥1.52');
  page.setData({ withdrawAmountInput: '123.456' });
  page.refreshAmountSummary();
  assert.equal(Boolean(page.data.isSubmitEnabled), false);
});

test('missing finance configuration and failed refresh both disable withdrawal', async () => {
  let info = { availableCommission: 10000, minWithdrawAmount: 5000, withdrawFeeRates: { bank: 0 } };
  const { page } = load('pages/distribution/withdraw/index.js', { '../../../api/index': { getDistributorInfo: async () => info } });
  await page.loadPage();
  info = {};
  await page.loadPage({ silent: true });
  assert.equal(page.data.hasLoaded, false);
  assert.equal(page.data.isSubmitEnabled, false);
  assert.ok(page.data.loadError);
});

test('two taps cannot submit duplicate withdrawal applications', async () => {
  let release, submissions = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const { page } = load('pages/distribution/withdraw/index.js', {
    '../../../api/index': {
      getDistributorInfo: async () => ({ availableCommission: 10000, minWithdrawAmount: 5000, withdrawFeeRates: { bank: 0 } }),
      applyWithdraw: async () => { submissions++; await gate; },
    },
  });
  await page.loadPage();
  page.setData({ withdrawAmountInput: '100', bankName: 'Bank', bankAccountName: 'Test', bankAccountNo: '1234567890123456' });
  const first = page.submitWithdraw();
  await page.submitWithdraw();
  release();
  await first;
  assert.equal(submissions, 1);
});

test('paid withdrawals display as paid and rejected amounts are excluded from paid totals', async () => {
  const { page } = load('pages/distribution/withdraw-records/index.js', {
    '../../../api/index': { getWithdrawRecords: async () => [{ id: 1, amount: 10000, fee: 100, actualAmount: 9900, status: 'paid' },
      { id: 2, amount: 20000, status: 'rejected' }] },
  });
  await page.loadPage();
  assert.equal(page.data.records[0].statusLabel, '已打款');
  assert.equal(page.data.summary.completedCount, '1');
  assert.equal(page.data.summary.totalAmountLabel, '¥99.00');
});

test('failed remote report never falls back to an unrelated cached report', async () => {
  const { page, storage } = load('pages/assessment/snore-result/index.js', {
    '../../../api/index': { getAssessmentDetail: async () => { throw new Error('Report unavailable'); } },
  });
  storage.set('last_local_snore_result', { id: 'local', snoreAnalysis: { riskLevel: 'low' } });
  page.onLoad({ id: 'snore-999' });
  await page.loadPage();
  assert.equal(page.data.reportDetail, null);
  assert.equal(page.data.loadError, 'Report unavailable');
});

test('local reports require both account and patient to match', async () => {
  const { page, storage } = load('pages/assessment/snore-result/index.js', {
    '../../../stores/session-store': { fetchProfile: async () => ({ id: 1 }) },
  });
  const report = { id: 'local', ownerUserId: 2, patientId: 3, snoreAnalysis: { riskLevel: 'normal' } };
  storage.set('last_local_snore_result', report);
  page.onLoad({ id: 'local', patientId: '3' });
  await page.loadPage();
  assert.equal(page.data.reportDetail, null);
  report.ownerUserId = 1;
  page.onLoad({ id: 'local', patientId: '4' });
  await page.loadPage();
  assert.equal(page.data.reportDetail, null);
  page.onLoad({ id: 'local', patientId: '3' });
  await page.loadPage();
  assert.equal(page.data.reportDetail.patientId, 3);
});

test('logout clears report and pending uploads', () => {
  const { exports: session, storage } = load('stores/session-store.js');
  for (const key of ['last_local_snore_result', 'pending_snore_uploads', 'pending_appointment_assessment', 'current_patient_id']) storage.set(key, 'old');
  session.logout();
  assert.equal(storage.size, 0);
});

test('pending report sync skips other accounts and reports partial failure honestly', async () => {
  const submitted = [];
  const { exports: api, storage } = load('api/modules/assessment-api.js', {
    '../../stores/session-store': { fetchProfile: async () => ({ id: 1 }), getAccessToken: () => 'token' },
    '../request': { request: async ({ data }) => { submitted.push(data); throw new Error('Network unavailable'); } },
  });
  storage.set('pending_snore_uploads', [{ ownerUserId: 2, patientId: 2 }, { ownerUserId: 1, patientId: 1 }]);
  await assert.rejects(api.syncPendingSnoreRecordings(), /未同步成功/);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].patientId, 1);
  assert.equal(storage.get('pending_snore_uploads').length, 1);
});

test('refund pending is not displayed as pending payment', () => {
  const { page } = load('pages/order/detail.js');
  const order = page.normalizeOrder({ id: 1, status: 'refund_pending' });
  assert.equal(order.statusLabel, '退款待审核');
  assert.equal(order.steps[0].label, '退款待审核');
  assert.equal(order.actionFlags.canPay, false);
  assert.equal(page.normalizeOrder({ status: 'unknown' }).steps.length, 0);
});

test('failed appointment cancellation never displays cancellation success', async () => {
  let modal;
  const { page, toasts } = load('pages/appointment/confirm.js', {
    '../../api/index': { createAppointment: async () => ({ id: 1, status: 'pending_payment' }),
      cancelAppointment: async () => { throw new Error('Unavailable'); } },
  }, { showModal: options => { modal = options; } });
  page.setData({ draft: { timeSlot: { label: '10:00' } }, memberList: [{ id: 1 }], memberIndex: 0 });
  await page.submitAppointment();
  assert.ok(modal);
  await modal.success({ confirm: false });
  assert.equal(toasts.some(item => item.title === '已取消预约'), false);
  assert.equal(toasts.some(item => item.title.includes('取消未成功')), true);
});

test('appointment success page rejects unpaid and cancelled bookings', async () => {
  let status = 'pending_payment';
  const { page } = load('pages/appointment/success.js', { '../../api/index': {
    getAppointmentDetail: async () => ({ id: 1, status }), getBookingSettings: async () => ({}), getStores: async () => [],
  } });
  page.options = { id: 1 };
  await page.loadPage();
  assert.ok(page.data.loadError);
  status = 'cancelled';
  await page.loadPage();
  assert.ok(page.data.loadError);
  status = 'pending';
  await page.loadPage();
  assert.equal(page.data.loadError, '');
});

test('home uses actual zeros and unknown placeholders', async () => {
  let stats = { totalPatients: 0, satisfactionRate: null, storeCount: 0 };
  const { page } = load('pages/index/index.js', { '../../api/index': {
    getHomeStats: async () => stats, getDoctors: async () => [], getStores: async () => [],
  } });
  await page.loadPage();
  assert.equal(page.data.patientCountLabel, '0');
  assert.equal(page.data.satisfactionRateLabel, '--');
  assert.equal(page.data.storeCountLabel, '0');
  stats = {};
  await page.loadPage();
  assert.equal(page.data.patientCountLabel, '--');
  assert.equal(page.data.storeCountLabel, '--');
});

test('home preserves successful directory responses when statistics fail', async () => {
  const { page } = load('pages/index/index.js', { '../../api/index': {
    getHomeStats: async () => { throw new Error('Unavailable'); },
    getDoctors: async () => ({ data: [{ id: 12, name: 'Doctor' }] }),
    getStores: async () => ({ data: [{ id: 34, name: 'Store' }] }),
  } });
  await page.loadPage();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.patientCountLabel, '--');
  assert.equal(page.data.recommendedDoctors[0].id, 12);
  assert.equal(page.data.stores[0].id, 34);
});

test('home reports failure when all three requests fail', async () => {
  const fail = async () => { throw new Error('Unavailable'); };
  const { page } = load('pages/index/index.js', { '../../api/index': {
    getHomeStats: fail, getDoctors: fail, getStores: fail,
  } });
  await page.loadPage();
  assert.equal(page.data.loading, false);
  assert.ok(page.data.loadError);
  assert.equal(page.data.recommendedDoctors.length, 0);
  assert.equal(page.data.stores.length, 0);
});

test('home does not require array-destructuring Babel helpers', () => {
  const source = fs.readFileSync(path.join(__dirname, 'pages/index/index.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:const|let|var)\s*\[/);
  assert.doesNotMatch(source, /@babel\/runtime/);
});

test('no mini-program page retains a mock payment branch or random recording wave', () => {
  const files = ['pages/product/detail.js', 'pages/order/detail.js', 'pages/appointment/confirm.js', 'pages/appointment/detail.js'];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, file), 'utf8'), /mockPayment/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, 'pages/assessment/recording/index.js'), 'utf8'), /Math\.random|qualityScore:\s*85/);
});

const memberPagePath = 'pages/profile/family-members/add-member/index.js';
const memberPayload = { name: 'Test patient', relation: 'child', gender: '1', birthday: '2015-06-01',
  phone: '13800138001', storeId: '1', region: 'Test region', address: 'Test address' };

test('new patient form saves extended fields once and selects the result on return', async () => {
  let release, submitted, calls = 0, selected, navigated = false;
  const callbacks = [];
  const gate = new Promise(resolve => { release = resolve; });
  const { page, storage } = load(memberPagePath, { '../../../../api/index': {
    addFamilyMember: async payload => { submitted = payload; calls++; await gate; return { data: { id: 37 } }; },
  } }, { navigateBack() { navigated = true; } }, {
    setTimeout(fn) { callbacks.push(fn); },
    getCurrentPages: () => [{ selectCreatedPatient(id) { selected = id; } }, {}],
  });
  page.setData({ ...memberPayload, age: '11', returnToAppointment: true });
  const first = page.submitAddMember();
  await page.submitAddMember();
  release();
  await first;
  assert.equal(calls, 1);
  assert.equal(submitted.birthday, memberPayload.birthday);
  assert.equal(submitted.address, memberPayload.address);
  assert.equal(page.data.isSubmitting, true);
  callbacks[0]();
  assert.equal(selected, '37');
  assert.equal(navigated, true);
  assert.equal(storage.size, 0);
});

test('patient form rejects invalid dates, missing clinic and failed submissions can retry', async () => {
  const { page } = load(memberPagePath, { '../../../../api/index': {
    addFamilyMember: async () => { throw Error('Unavailable'); },
  } });
  for (const birthday of ['2025-02-29', '2015-02-30', '2999-01-01']) {
    assert.ok(page.validatePayload({ ...memberPayload, birthday }));
  }
  assert.ok(page.validatePayload({ ...memberPayload, storeId: '' }));
  page.setData({ ...memberPayload, age: '11' });
  await page.submitAddMember();
  assert.equal(page.data.isSubmitting, false);
});

test('failed avatar uploads preserve the saved avatar and block submitting while uploading', async () => {
  let choose, release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const { page } = load(memberPagePath, { '../../../../api/index': {
    uploadLocalFile: async () => { await gate; throw Error('Upload failed'); },
    addFamilyMember: async () => { calls++; },
  } }, { chooseImage(options) { choose = options; } });
  page.setData({ ...memberPayload, avatarUrl: '/uploads/old.jpg', avatarPreviewUrl: '/uploads/old.jpg' });
  page.chooseAvatar();
  const upload = choose.success({ tempFilePaths: ['wxfile://new.jpg'] });
  await page.submitAddMember();
  assert.equal(calls, 0);
  release();
  await upload;
  assert.equal(page.data.avatarUrl, '/uploads/old.jpg');
  assert.equal(page.data.avatarPreviewUrl, '/uploads/old.jpg');
  assert.equal(page.data.isUploading, false);
});

test('appointment selects the new patient only within the same login session', async () => {
  let token = 'session-one';
  const { page } = load('pages/appointment/confirm.js', {
    '../../stores/session-store': { getAccessToken: () => token },
    '../../stores/appointment-draft-store': { getDraft: () => ({ doctorId: 1, storeId: 1, scheduleId: 1, timeSlot: { label: '09:00' } }) },
    '../../api/index': {
      getStores: async () => [], getDoctors: async () => [], getBookingSettings: async () => ({}),
      getFamilyMembers: async () => [{ id: 1, relation: 'self', name: 'Self' }, { id: 37, relation: 'child', name: 'Child' }],
    },
  });
  page.selectCreatedPatient('37');
  await page.loadPage();
  assert.equal(page.data.memberIndex, 1);
  page.selectCreatedPatient('37');
  token = 'session-two';
  await page.loadPage();
  assert.equal(page.data.memberIndex, 0);
});
