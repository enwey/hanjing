const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../mp-weixin-rewrite');
function selection() {
  let definition, pages = [], generation = 1, navigated = '', returned = 0, modal;
  const api = { getFamilyMembers: async () => ({ data: [] }), getUserProfile: async () => ({ data: {} }) };
  const wx = { navigateTo: ({url}) => { navigated = url; }, navigateBack: () => { returned++; }, showToast() {}, showModal: options => { modal = options; } };
  const session = { getLoginGeneration: () => generation };
  const context = { Page: x => { definition = x; }, wx, getCurrentPages: () => pages, console,
    require: name => name.includes('user') ? api : name.includes('api/index') ? api : name.includes('session-store') ? session : { normalizeImageUrl: x => x } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/profile/family-members/index.js'), 'utf8'), context);
  const page = { ...definition, data: { ...definition.data }, setData(data) { Object.assign(this.data, data); } };
  return { page, wx, setPages: x => { pages = x; }, setGeneration: x => { generation = x; }, get navigation() { return navigated; }, get returned() { return returned; }, get modal() { return modal; } };
}
test('selection routes to common add page and passes the appointment store', () => {
 const h = selection(); h.page.onLoad({source:'appointment', selectedId:'7', storeId:'3', storeName:'诊所'}); h.page.goAddMember();
 assert.match(h.navigation, /add-member\/index\?source=appointment/); assert.match(h.navigation, /storeId=3/); assert.match(h.navigation, /storeName=/);
});
test('new patient is selected on the selection page and on return to confirmation', () => {
 const h = selection(); let selected; const confirm = {selectCreatedPatient(id) { selected = id; }}; h.page.onLoad({source:'appointment'}); h.setPages([confirm,h.page,{}]); h.page.selectCreatedPatient('42');
 assert.equal(h.page.data.selectedId,'42'); assert.equal(selected,'42');
});
test('existing patient selection preserves child warning and rejects account changes', () => {
 const h=selection(); let selected; const confirm={selectCreatedPatient(id){selected=id;}}; h.page.onLoad({source:'appointment'}); h.page.data.members=[{id:'8',ageLabel:'10'}]; h.setPages([confirm,h.page]);
 h.page.goMemberDetail({currentTarget:{dataset:{id:'8'}}}); assert.ok(h.modal); h.modal.success({confirm:false}); assert.equal(selected,undefined);
 h.page.goMemberDetail({currentTarget:{dataset:{id:'8'}}}); h.modal.success({confirm:true}); assert.equal(selected,'8'); assert.equal(h.returned,1);
 h.setGeneration(2); h.page.goMemberDetail({currentTarget:{dataset:{id:'8'}}}); assert.equal(h.returned,1);
});
test('profile management mode keeps its original detail and add routes', () => {
 const h=selection(); h.page.onLoad({}); h.page.goAddMember(); assert.equal(h.navigation,'/pages/profile/family-members/add-member/index');
 h.page.goMemberDetail({currentTarget:{dataset:{id:'7'}}}); assert.equal(h.navigation,'/pages/profile/family-members/add-member/index?id=7');
});
