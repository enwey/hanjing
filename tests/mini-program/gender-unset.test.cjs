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
  vm.runInContext(fs.readFileSync(path.resolve('mp-weixin-rewrite', relative), 'utf8'), context, { filename: relative });
  if (page) {
    page.data = structuredClone(page.data);
    page.setData = function(value, callback) { Object.assign(this.data, value); if (callback) callback(); };
  }
  return { page, storage, toasts, exports: context.module.exports };
}


test('未设置性别不默认选中，保存昵称仍提交0',async()=>{
 let submitted;const api={updateUserProfile:async data=>{submitted=data;return {data:{...data}}}};
 const {page}=load('pages/profile/settings/personal-info/index.js',{'../../../../api/index':api,'../../../../stores/session-store':{state:{}}});
 page.applyProfileData({nickname:'测试',gender:0,birthday:''});assert.equal(page.data.displayGender,'未设置');assert.ok(!page.data.maleChipClass.includes('active'));assert.ok(!page.data.femaleChipClass.includes('active'));await page.saveProfile();assert.equal(submitted.gender,0);assert.equal(submitted.birthday,'');
 page.selectFemale();assert.equal(page.data.displayGender,'女');await page.saveProfile();assert.equal(submitted.gender,2);
});
test('家庭成员新建不默认性别，已有未知性别也不转换为男',()=>{const {page}=load('pages/profile/family-members/add-member/index.js');assert.equal(page.data.gender,'');assert.match(page.validatePayload({name:'测试',storeId:1,phone:'13800000000',relation:'child',gender:'',birthday:'2015-01-01'}),/性别/);});
