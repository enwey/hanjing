// Read-only execution of actual mini-program page/session/request modules.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '../../mp-weixin-rewrite');
const out = path.join(__dirname, 'artifacts/appointment-audit-2026-11-18');
fs.mkdirSync(out, { recursive: true });
const files = ['pages/appointment/booking/index.js', 'pages/appointment/confirm.js', 'pages/appointment/detail.js', 'pages/appointment/reschedule.js', 'pages/appointment/time-select.js', 'stores/session-store.js', 'api/request.js'];
const hashes = () => Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex')]));
const sourceBefore = hashes();
const helper = path.join(__dirname, 'login-comprehensive.cjs'), fixture = { exports: {} };
vm.runInNewContext(fs.readFileSync(helper, 'utf8').split('const cases=[];')[0] + '\nmodule.exports={harness,token,gate,tick};', {
  module: fixture, require: createRequire(helper), __dirname, Buffer, console, structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { harness, token, gate, tick } = fixture.exports;
const expired = `e30.${Buffer.from(JSON.stringify({ id: 'a', exp: 1 })).toString('base64url')}.signature`;
const members = [{ id: 'self', name: '本人', relation: 'self' }, { id: 'family', name: '家人', relation: 'parent' }];
const initialDraft = () => ({ doctorId: '1', storeId: '1', scheduleId: '1', appointmentDate: '2099-01-01', timeSlot: { label: '09:00-09:30' } });
function loadPage(file, h, api, options = {}) {
  let page; const nav = [], timers = [], toasts = [], modals = [];
  const draftStore = { getDraft: () => h.storage.get('rewrite_appointment_draft'),
    setDraft: d => h.storage.set('rewrite_appointment_draft', d), clearDraft: () => h.storage.delete('rewrite_appointment_draft') };
  const wx = { getStorageSync: k => h.storage.get(k), setStorageSync: (k,v) => h.storage.set(k,v), removeStorageSync: k => h.storage.delete(k),
    showToast: o => toasts.push(o.title), showLoading() {}, hideLoading() {}, showModal: o => modals.push(o),
    reLaunch: o => nav.push(o.url), navigateTo: o => nav.push(o.url), navigateBack: o => nav.push(o.delta),
    requestPayment: o => options.requestPayment ? options.requestPayment(o) : o.success({}), stopPullDownRefresh() {} };
  if (!h.paymentReceipt) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'common/utils/appointment-payment-receipt.js'), 'utf8'), { module, wx });
    h.paymentReceipt = module.exports;
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/appointment', file), 'utf8'), {
    require: p => p.includes('appointment-payment-receipt') ? h.paymentReceipt : p.includes('appointment-time') ? require(path.join(root,'common/utils/appointment-time.js')) :
      p.includes('api/index') ? api : p.includes('session-store') ? h.store : p.includes('appointment-draft') ? draftStore :
      p.includes('subscribe') ? { requestSubscribe: async () => {}, refreshSubscribeSettings: async () => {}, subscribeToVisitReminder: async () => {} } :
      p.includes('image-url') ? { normalizeImageUrl: x => x || '', getStoreCoverUrl: () => '' } :
      p.includes('stack-navigation') ? { openFromHome: url => nav.push(url) } :
      p.includes('navigation') ? { openPage: url => nav.push(url) } : {},
    Page: p => { page=p; p.data=structuredClone(p.data); p.setData=d=>Object.assign(p.data,d); }, wx,
    console: { error() {}, log() {}, warn() {} }, setTimeout: f => timers.push(f), clearTimeout() {},
  });
  return { page, nav, timers, toasts, modals, draftStore };
}
function create(options={}) {
  const h = harness({ storage: { access_token: options.expired ? expired : token('a'), auth_mode: 'wechat' }, response: options.response });
  h.storage.set('rewrite_appointment_draft', initialDraft());
  return h;
}
function confirmApi(h) {
  return { getStores: async () => ({ data: [{ id: '1', name: '门店' }] }), getDoctors: async () => ({ data: [{ id: '1', name: '医生', consultFee: 0 }] }),
    getFamilyMembers: () => h.request.request({ url: '/user/family-members' }), getBookingSettings: async () => ({ data: { requireDeposit: false } }) };
}
const results=[];
async function check(id, fn) {
  try { await fn(); results.push({ id, result:'passed' }); }
  catch(e) { results.push({ id, result:'failed', error:e.message, observations:e.observations }); }
  console.log(`${results.at(-1).result.toUpperCase()} ${id}`);
}
function expect(actual, expected, message, observations) {
  try { assert.equal(actual, expected, message); } catch(e) { e.observations=observations; throw e; }
}
function renewalResponse(o) {
  if (o.url.includes('/auth/')) return { statusCode:200, data:{ data:{ access_token:token('a') } } };
  if (o.header.Authorization === 'Bearer '+expired) return { statusCode:401, data:{} };
  return { statusCode:200, data:{ data:o.url.endsWith('/user/family-members') ? members : [{ id:'apt-a',status:'pending',patientName:'本人' }] } };
}
(async()=>{
  await check('APT-AUDIT-01 booking list finishes after automatic session renewal', async()=>{
    const h=create({ expired:true,response:renewalResponse });
    const api={ getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:()=>h.request.request({url:'/appointments'}) };
    const {page}=loadPage('booking/index.js',h,api); await page.loadPage();
    assert.equal(h.authCalls().length,1); assert.equal(h.store.getAccessToken(),token('a'));
    expect(page.data.loading,false,'renewed session left appointment list loading',{loading:page.data.loading,appointments:page.data.upcomingAppointments.length,authCalls:h.authCalls().length});
  });
  await check('APT-AUDIT-02 confirmation finishes after automatic session renewal', async()=>{
    const h=create({expired:true,response:renewalResponse}); const {page}=loadPage('confirm.js',h,confirmApi(h)); await page.loadPage();
    assert.equal(h.authCalls().length,1);
    expect(page.data.loading,false,'renewed session discarded confirmation load',{loading:page.data.loading,memberCount:page.data.memberList.length,draftLoaded:Boolean(page.data.draft)});
  });
  await check('APT-AUDIT-03 selected family survives same-account automatic renewal', async()=>{
    let renew=false;
    const renewedToken=`e30.${Buffer.from(JSON.stringify({id:'a',exp:4102444900})).toString('base64url')}.signature`;
    const h=create({response:o=>{
      if(o.url.includes('/auth/')) return {statusCode:200,data:{data:{access_token:renewedToken}}};
      if(renew && o.header.Authorization==='Bearer '+token('a'))return {statusCode:401,data:{}};
      return {statusCode:200,data:{data:members}};
    }});
    const {page}=loadPage('confirm.js',h,confirmApi(h)); await page.loadPage(); page.handleMemberChange({detail:{value:1}});
    assert.equal(page.data.memberList[page.data.memberIndex].id,'family');
    renew=true; await page.loadPage({silent:true}); await page.loadPage({silent:true});
    expect(page.data.memberList[page.data.memberIndex].id,'family','same-account refresh reset selected patient to self',{selectedPatient:page.data.memberList[page.data.memberIndex].id,authCalls:h.authCalls().length});
  });
  await check('APT-AUDIT-04 delayed detail response cannot repopulate after logout', async()=>{
    const g=gate(); const h=create();
    const api={ getBookingSettings:async()=>({}),getAppointmentDetail:()=>g.promise };
    const {page}=loadPage('detail.js',h,api); page.options={id:'apt-a'};
    const pending=page.loadPage(); await tick(); h.store.logout();
    g.resolve({data:{appointment:{id:'apt-a',patientName:'上一账号患者',status:'pending',appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'},doctor:{},store:{}}}); await pending;
    expect(page.data.appointmentLoaded,false,'old appointment detail rendered after logout',{isLoggedIn:h.store.isLoggedIn(),appointmentLoaded:page.data.appointmentLoaded,patientName:page.data.patientName});
  });
  await check('APT-AUDIT-05 older detail load cannot overwrite newer appointment status', async()=>{
    const a=gate(),b=gate();let calls=0; const h=create();
    const {page}=loadPage('detail.js',h,{getBookingSettings:async()=>({}),getAppointmentDetail:()=>++calls===1?a.promise:b.promise});page.options={id:'apt-a'};
    const first=page.loadPage(),second=page.loadPage();
    const payload=status=>({data:{appointment:{status,appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'},doctor:{},store:{}}});
    b.resolve(payload('cancelled'));await second;assert.equal(page.data.statusKey,'cancelled');a.resolve(payload('pending'));await first;
    expect(page.data.statusKey,'cancelled','old detail response reverted latest cancellation status',{status:page.data.statusKey});
  });
  await check('APT-AUDIT-06 completed create response must not clear replacement-account draft', async()=>{
    const g=gate();const h=create({response:()=>({statusCode:200,data:{data:members}})});
    const api=confirmApi(h);api.createAppointment=()=>g.promise;
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();const pending=s.page.submitAppointment();await tick();
    h.store.logout();h.store.switchAccount('b');h.store.setAccessToken(token('b'));h.store.setAuthMode('wechat');
    const bDraft={...initialDraft(),doctorId:'2'};s.draftStore.setDraft(bDraft);h.storage.set('pending_appointment_assessment',{id:'b-assessment',type:'ess'});
    g.resolve({data:{id:'apt-a',status:'pending'}});await pending;
    expect(Boolean(s.draftStore.getDraft()),true,'old create response deleted new account draft',{draftPreserved:Boolean(s.draftStore.getDraft()),assessmentPreserved:h.storage.has('pending_appointment_assessment'),navigation:s.nav});
  });
  await check('APT-AUDIT-07 normal logged-in booking list loads',async()=>{
    const h=create();const {page}=loadPage('booking/index.js',h,{getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:async()=>({data:[{id:'apt-a',status:'pending'}]})});
    await page.loadPage();assert.equal(page.data.loading,false);assert.equal(page.data.upcomingAppointments.length,1);
  });
  await check('APT-AUDIT-08 unchanged session retains family selection',async()=>{
    const h=create({response:()=>({statusCode:200,data:{data:members}})});const {page}=loadPage('confirm.js',h,confirmApi(h));
    await page.loadPage();page.handleMemberChange({detail:{value:1}});await page.loadPage({silent:true});assert.equal(page.data.memberList[page.data.memberIndex].id,'family');
  });
  await check('APT-AUDIT-09 confirmed creation clears own draft and navigates once',async()=>{
    const h=create({response:()=>({statusCode:200,data:{data:members}})});const api=confirmApi(h);let calls=0;api.createAppointment=async()=>({data:{id:'apt-a',status:'pending'}});
    const s=loadPage('confirm.js',h,api);const original=api.createAppointment;api.createAppointment=()=>{calls++;return original();};await s.page.loadPage();await s.page.submitAppointment();await s.page.submitAppointment();
    assert.equal(calls,1);assert.equal(s.nav.length,1);assert.equal(s.draftStore.getDraft(),undefined);
  });
  await check('APT-AUDIT-10 preparing store cannot proceed to booking',async()=>{
    const s=loadPage('store-select.js',create(),{});s.page.handleStoreTap({detail:{id:'s1',status:'prepare'}});
    assert.equal(s.nav.length,0);assert.equal(s.toasts.length,1);
  });
  await check('APT-AUDIT-11 full slot cannot create an appointment draft',async()=>{
    const h=create();h.storage.delete('rewrite_appointment_draft');
    const s=loadPage('time-select.js',h,{getDaySlots:async()=>({data:[{id:'full',scheduleId:'1',label:'09:00-09:30',status:'full'}]})});
    s.page.data.doctorId='1';s.page.data.storeId='1';await s.page.loadSchedulesForDate('2099-01-01');
    s.page.handleTimeSlotTap({currentTarget:{dataset:{timeSlotId:'full'}}});
    assert.equal(s.nav.length,0);assert.equal(s.draftStore.getDraft(),undefined);
  });
  await check('APT-AUDIT-12 booking payment success confirms and reloads records',async()=>{
    let pay=0,confirm=0;
    const api={getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:async()=>[],
      payAppointmentDeposit:async()=>{pay++;return {data:{timeStamp:'fixture'}};},confirmAppointmentPayment:async()=>{confirm++;return {};}};
    const s=loadPage('booking/index.js',create(),api);
    await s.page.handlePrimaryAction({detail:{id:'apt-a',status:'pending_payment'}});
    assert.equal(pay,1);assert.equal(confirm,1);assert.equal(s.page.data.loading,false);
  });
  const sourceAfter=hashes();const sourceStable=JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter);
  const evidence={method:'actual client modules; simulated WeChat/HTTP and controlled response order; no business database writes',sourceBefore,sourceAfter,sourceStable,results,passed:results.filter(r=>r.result==='passed').length,failed:results.filter(r=>r.result==='failed').length};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,failed:evidence.failed,sourceStable}));
  process.exitCode=evidence.failed||!sourceStable?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
