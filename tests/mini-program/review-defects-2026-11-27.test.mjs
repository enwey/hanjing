import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');

function makePage(name, dependencies = {}) {
  let page;
  const hooks = { ...dependencies, Page: value => { page = value; }, getCurrentPages: () => [page] };
  runInNewContext(source('mp-weixin-rewrite/pages/' + name + '/index.js'), hooks);
  page.setData = values => Object.assign(page.data, values);
  return page;
}

for (const family of [false, true]) {
  test('account switch during consent discards ' + (family ? 'family' : 'personal') + ' data', async () => {
    let generation = 1;
    let accept;
    let writes = 0;
    const session = { getLoginGeneration: () => generation, state: {} };
    const api = { addFamilyMember: async () => { writes++; }, updateUserProfile: async () => { writes++; } };
    const page = makePage(family ? 'profile/family-members/add-member' : 'profile/settings/personal-info', {
      wx: { showToast() {} },
      require: name => name.includes('confirm-sensitive') ? () => new Promise(resolve => { accept = resolve; })
        : name.includes('session-store') ? session : name.includes('/api/') ? api : {}
    });
    if (family) {
      page.loadStores = async () => {};
      page.buildPayload = () => ({ name: 'Previous account' });
      page.validatePayload = () => '';
    }
    await page.onLoad({});
    Object.assign(page.data, { nickname: 'Previous account', idCard: '1'.repeat(18) });
    const run = () => family ? page.submitAddMember() : page.saveProfile();
    const pending = run();
    assert.equal(typeof accept, 'function');
    generation++;
    accept(true);
    await pending;
    await run();
    assert.equal(writes, 0);
  });
}

test('account switch during avatar upload prevents personal profile write', async () => {
  let generation = 1;
  let finishUpload;
  let writes = 0;
  const api = {
    uploadLocalFile: () => new Promise(resolve => { finishUpload = resolve; }),
    updateUserProfile: async () => { writes++; }
  };
  const page = makePage('profile/settings/personal-info', {
    wx: { showLoading() {}, hideLoading() {} },
    require: name => name.includes('session-store') ? { getLoginGeneration: () => generation, state: {} }
      : name.includes('/api/') ? api : {}
  });
  page.onLoad();
  Object.assign(page.data, { nickname: 'Previous account', pendingAvatarPath: 'photo.png' });
  const pending = page.saveProfile();
  generation++;
  finishUpload({ data: { url: '/uploads/medical-attachments/p.png' } });
  await pending;
  assert.equal(writes, 0);
});


function makeService(request, wx = {}, session = { getLoginGeneration: () => 1 }, api = {}) {
  const apiBaseUrl = 'https://m.xingkangming.com/api/v1';
  const page = makePage('profile/online-service', {
    require: name => name.includes('api/request') ? { request, apiBaseUrl }
      : name.includes('asset-url') ? { normalizeAssetUrl: value => value }
      : name.includes('session-store') ? session : api,
    wx,
    setTimeout() {}
  });
  page.onLoad();
  return page;
}

test('signed history attachment resolves from the host, not the API prefix', () => {
  const page = makeService();
  page.setMessages([{ id: '1', from: 'user', status: 'success', text: '[image]/uploads/medical-attachments/test.jpg?asset_token=signed' }]);
  assert.equal(page.data.messages[0].displayUrl, 'https://m.xingkangming.com/uploads/medical-attachments/test.jpg?asset_token=signed');
});

test('rejected protected attachment shows retry even when the chat socket is connected', async () => {
  let calls = 0;
  const page = makeService(async () => {
    if (++calls === 1) throw Object.assign(new Error('附件无效'), { statusCode: 400 });
    return { code: 0 };
  });
  page.isSocketConnected = true;
  page.socketTask = { send() { assert.fail('Protected images must have a per-message HTTP result'); } };
  const image = { id: '1', from: 'user', status: 'sending', text: '[image]/uploads/medical-attachments/test.jpg' };
  page.setMessages([image, { id: '2', from: 'user', status: 'sending', text: 'unrelated' }]);
  await page.sendMsgWithRetry(image);
  assert.equal(page.data.messages[0].failed, true);
  assert.equal(page.data.messages[0].sending, false);
  assert.equal(page.data.messages[1].sending, true);
  await page.retrySendMessage({ currentTarget: { dataset: { id: '1' } } });
  assert.equal(page.data.messages[0].failed, false);
  assert.equal(page.data.messages[0].sending, false);
  assert.equal(calls, 2);
});

test('old unapproved nickname cannot block a birthday save or publish itself', async () => {
  const routes = source('hanjing-clinic-backend/routes/client.js');
  const route = routes.slice(routes.indexOf("app.put('/api/v1/user/profile'"));
  let handle;
  let checks = 0;
  let result;
  const writes = [];
  const user = { id: 1, nickname: '旧昵称', community_nickname: null, openid: 'test' };
  runInNewContext(route.slice(0, route.indexOf('\n});') + 4), {
    app: { put(_route, _auth, fn) { handle = fn; } },
    authenticateWxToken() {},
    escapeHtml: value => value,
    normalizeFamilyBirthday: () => true,
    calculateAgeFromBirthday: () => null,
    privateUploadPath: () => null,
    get: async () => user,
    checkWechatText: async () => { checks++; return 'unavailable'; },
    rejectUncheckedContent: (res, decision) => {
      res.status(503).json({ code: decision });
      return true;
    },
    transaction: fn => fn({ execute: async (sql, args) => {
      if (sql.includes('UPDATE users')) {
        writes.push(Array.from(args));
        user.birthday = args[2];
      }
      return [[]];
    } }),
    getSelfPatientForUserWithConn: async () => null,
    getSelfPatientForUser: async () => null,
    publicAvatar: () => '',
    decryptPII: () => '',
    formatDate: value => value,
    getCurrentUserMembership: async () => null,
    console: { error() {} }
  });
  const res = { status(code) { this.http = code; return this; }, json(value) { result = value; } };
  await handle({ body: { nickname: user.nickname, birthday: '2000-01-02' }, user: { id: 1 } }, res);
  assert.deepEqual(writes, [[null, null, '2000-01-02', null, 1]]);
  assert.equal(checks, 0);
  assert.equal(result.code, 0);
  assert.equal(result.data.birthday, '2000-01-02');
  await handle({ body: { nickname: '改名' }, user: { id: 1 } }, res);
  assert.equal(res.http, 503);
  assert.equal(result.code, 'unavailable');
  assert.equal(checks, 1);
  assert.equal(writes.length, 1);
});

test('comment notification only includes a currently published target', async () => {
  const js = source('hanjing-clinic-backend/notification-center.js');
  const fn = js.slice(js.indexOf('export async function resolveNotificationTarget'), js.indexOf('\nexport function installNotificationRoutes')).trim().replace(/^export /, '');
  let status = 'approved';
  const resolve = runInNewContext('(' + fn + ')', {
    parseJson: value => value,
    get: async sql => sql.includes('post_comments')
      ? (!sql.includes("status='approved'") || status === 'approved' ? { id: 17 } : null)
      : { id: 9, status: 'approved' }
  });
  const notification = { business_type: 'post', business_id: 9, metadata: { commentId: 17 } };
  assert.equal(await resolve(1, notification), '/pages/community/detail/index?id=9&commentId=17');
  status = 'hidden';
  assert.equal(await resolve(1, notification), '/pages/community/detail/index?id=9');
});


for (const family of [false, true]) {
  test('unchanged session allows ' + (family ? 'family' : 'personal') + ' data submission', async () => {
    const writes = [];
    const session = { getLoginGeneration: () => 1, state: {} };
    const save = async data => { writes.push(data); return { data: { id: '1' } }; };
    const api = { addFamilyMember: save, updateUserProfile: save };
    const page = makePage(family ? 'profile/family-members/add-member' : 'profile/settings/personal-info', {
      wx: { showToast() {}, hideLoading() {} },
      setTimeout() {},
      require: name => name.includes('confirm-sensitive') ? async () => true
        : name.includes('session-store') ? session : name.includes('/api/') ? api : {}
    });
    page.loadProfile = async () => {};
    page.loadStores = async () => {};
    page.buildPayload = () => ({ name: 'Current account family member' });
    page.validatePayload = () => '';
    await page.onLoad({});
    Object.assign(page.data, { nickname: 'Current account', idCard: '1'.repeat(18) });
    await (family ? page.submitAddMember() : page.saveProfile());
    assert.equal(writes.length, 1);
    assert.equal(family ? writes[0].name : writes[0].nickname, family ? 'Current account family member' : 'Current account');
  });
}


test('consultation image callbacks never issue requests for a different account', async () => {
  for (const boundary of ['consent', 'picker', 'read', 'upload', 'same account']) {
    let generation = 1;
    let confirm, choose, read, finishUpload;
    const uploads = [], sends = [];
    const page = makeService(async options => {
      sends.push(options);
      return { code: 0, data: { id: '17' } };
    }, {
      showModal: options => { confirm = options.success; },
      chooseMedia: options => { choose = options.success; },
      showLoading() {}, hideLoading() {}, showToast() {},
      getFileSystemManager: () => ({ readFile: options => { read = options.success; } })
    }, { getLoginGeneration: () => generation }, {
      uploadFile: data => {
        uploads.push({ generation, data });
        return new Promise(resolve => { finishUpload = resolve; });
      }
    });
    page.onUploadImage();
    if (boundary === 'consent') generation++;
    confirm({ confirm: true });
    if (boundary === 'consent') assert.equal(choose, undefined);
    if (boundary === 'picker') generation++;
    choose?.({ tempFiles: [{ tempFilePath: 'photo.jpg' }] });
    if (boundary === 'picker') assert.equal(read, undefined);
    if (boundary === 'read') generation++;
    const reading = read?.({ data: 'picture' });
    if (boundary === 'upload') generation++;
    finishUpload?.({ code: 0, data: { url: '/uploads/medical-attachments/photo.jpg' } });
    await reading;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(uploads, ['upload', 'same account'].includes(boundary) ? [{ generation: 1, data: 'picture' }] : []);
    assert.equal(sends.length, boundary === 'same account' ? 1 : 0);
    if (boundary === 'same account') assert.equal(page.data.messages[0].id, '17');
  }
});

test('chat refresh preserves rejected attachments through retry and deduplicates confirmed history', async () => {
  let reject, finish, history = [];
  let attempts = 0;
  const page = makeService(async options => {
    if (options.url === '/im/messages') return { code: 0, data: history };
    return new Promise((resolve, deny) => { if (++attempts === 1) reject = deny; else finish = resolve; });
  });
  const image = { id: 'local-1', from: 'user', text: '[image]/uploads/medical-attachments/photo.jpg', status: 'sending' };
  page.setMessages([image]);
  const sending = page.sendMsgWithRetry(image);
  await page.fetchHistory();
  assert.equal(page.data.messages[0].sending, true);
  reject(Object.assign(new Error('rejected'), { statusCode: 400 }));
  await sending;
  await page.fetchHistory();
  assert.equal(page.data.messages[0].failed, true);
  const retry = page.retrySendMessage({ currentTarget: { dataset: { id: image.id } } });
  finish({ code: 0, data: { id: '17' } });
  await retry;
  await page.fetchHistory();
  assert.equal(page.data.messages[0].id, '17');
  history = [{ id: 17, sender: 'patient', text: image.text + '?asset_token=signed' }];
  await page.fetchHistory();
  assert.equal(page.data.messages.length, 1);
  assert.match(page.data.messages[0].displayUrl, /asset_token=signed$/);
});

test('checkout denies and then accepts address access, fills the address and completes payment', async () => {
  const template = source('mp-weixin-rewrite/pages/product/detail.wxml');
  assert.match(template, /<hj-privacy-popup id="privacyPopup"\s*\/>/);
  const app = source('mp-weixin-rewrite/app.js');
  const start = app.indexOf('wx.onNeedPrivacyAuthorization((resolve)');
  let authorize, product, popup, denied = 0, destination;
  const checkout = [];
  const paymentModule = { exports: {} };
  runInNewContext(source('mp-weixin-rewrite/common/utils/order-payment.js'), { module: paymentModule });
  runInNewContext(source('mp-weixin-rewrite/components/business/hj-privacy-popup/index.js'), {
    Component: definition => {
      popup = { ...definition.methods, setData() {}, triggerEvent() {} };
    },
    wx: { showToast() {} }
  });
  runInNewContext(app.slice(start, app.indexOf('\n    }', start)), {
    wx: { onNeedPrivacyAuthorization: handler => { authorize = handler; } },
    getCurrentPages: () => [product]
  });
  runInNewContext(source('mp-weixin-rewrite/pages/product/detail.js'), {
    Page: definition => { product = definition; },
    require: name => name.includes('session-store') ? { getLoginGeneration: () => 1, isLoggedIn: () => true }
      : name.includes('order-payment') ? paymentModule.exports
        : name.includes('api/index') ? {
          createOrder: async input => {
            checkout.push('create');
            assert.equal(input.shippingAddress.contactName, 'Test');
            assert.equal(input.shippingAddress.phone, '13800138001');
            assert.equal(input.shippingAddress.detailAddress, 'CityDetail');
            return { data: { id: '7', payAmount: 1000 } };
          },
          payOrder: async () => { checkout.push('prepay'); return { data: { payAmount: 1000 } }; },
          confirmOrderPayment: async () => { checkout.push('confirm'); },
        } : {},
    wx: {
      showLoading() {}, hideLoading() {}, showToast() {},
      requestPayment(options) { checkout.push('native'); options.success(); },
      navigateTo(options) { destination = options.url; },
      chooseAddress: options => authorize(result => {
        if (result.event === 'agree') options.success({ userName: 'Test', telNumber: '13800138001', cityName: 'City', detailInfo: 'Detail' });
        else options.fail({ errMsg: 'privacy denied' });
      })
    }
  });
  product.selectComponent = selector => selector === '#privacyPopup' ? popup : null;
  product.setData = (values, done) => { Object.assign(product.data, values); done?.(); };
  product.getAddressPermissionState = async () => true;
  product.handleChooseWxAddressFail = () => { denied++; };
  Object.assign(product.data, { product: { id: '1', price: 1000 }, quantity: 1 });
  product.openCheckout();
  for (const nextChoice of ['handleDisagree', 'handleAgree']) {
    const picking = product.chooseWxAddress();
    await new Promise(resolve => setImmediate(resolve));
    popup[nextChoice]();
    await picking;
  }
  assert.equal(denied, 1);
  assert.equal(product.data.detailAddress, 'CityDetail');
  await product.onCheckoutSubmitTap();
  assert.deepEqual(checkout, ['create', 'prepay', 'native', 'confirm']);
  assert.equal(destination, '/pages/order/detail?id=7&notice=paymentSubmitted');
});
