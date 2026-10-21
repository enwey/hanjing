// Read-only business-module tests. All WeChat, HTTP, timers and storage are isolated.
// Run: node tests/mini-program/login-comprehensive.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../mp-weixin-rewrite');
const tick = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const token = id => `e30.${Buffer.from(JSON.stringify({ id, exp: 4102444800 })).toString('base64url')}.signature`;
const quiet = { log() {}, warn() {}, error() {} };
function harness(opts = {}) {
  const storage = new Map(Object.entries(opts.storage || {}));
  const calls = [], toasts = [], modals = [], nav = [], timers = new Map();
  let loading = false, page, store, request, auth, timerId = 0, hideCount = 0;
  const log = { report() {}, createTraceId: () => 'fixture-trace', reportNow: async e => { if (opts.log) await opts.log(e); } };
  const env = { envVersion: 'develop', getCurrentApiEnv: () => 'local', getApiEnvOptions: () => [{key:'local',label:'local',baseUrl:'http://fixture/api/v1'}], getApiBaseUrl: () => 'http://fixture/api/v1', getApiBaseUrls: () => ['http://fixture/api/v1'] };
  const wx = {
    getStorageSync: k => storage.get(k), setStorageSync: (k,v) => {if(opts.beforeStorageSet)opts.beforeStorageSet(k,v);storage.set(k,v);}, removeStorageSync: k => storage.delete(k),
    base64ToArrayBuffer: s => Uint8Array.from(Buffer.from(s, 'base64')).buffer,
    getSystemInfoSync: () => ({platform:'fixture'}),
    login: o => opts.wxLogin ? opts.wxLogin(o) : queueMicrotask(() => opts.wxFail ? o.fail({errMsg:'fixture failure'}) : o.success(opts.wxResult || {code:'fixture-code'})),
    showLoading: () => { loading = true; }, hideLoading: () => { loading = false; hideCount++; },
    showToast: o => toasts.push(o.title), showModal: o => modals.push(o),
    switchTab: o => {nav.push(['tab', o.url]); if(opts.navFail) o.fail();},
    reLaunch: o => {nav.push(['relaunch', o.url]); if(opts.navFail) o.fail();},
    navigateTo: o => nav.push(['to',o.url]), navigateBack: o => {nav.push(['back',o.delta]); if(opts.backFail) o.fail();},
    request: o => { calls.push(o); queueMicrotask(async () => {
      try {
        let result = opts.response ? await opts.response(o, calls) : undefined;
        if (result === undefined) result = {statusCode:200,data:{data:o.url.includes('/auth/') ? {access_token:token('user'),user:{id:'user'}} : {id:'user'}}};
        if (result.network) o.fail({errMsg:'fixture network failure'}); else o.success(result);
      } catch (e) { o.fail({errMsg:e.message}); }
    }); }
  };
  function load(file, requireFn) {
    const module = {exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'), {
      module, exports:module.exports, require:requireFn, wx, console:quiet,
      Page: p => {page=p; page.data=structuredClone(p.data); page.setData=d=>Object.assign(page.data,d);},
      getCurrentPages: () => opts.pages || [{}], getApp: () => ({globalData:{lastRoute:opts.lastRoute || ''}}),
      setTimeout: fn => {timers.set(++timerId,fn);return timerId;}, clearTimeout:id=>timers.delete(id)
    }, {filename:file});
    return module.exports;
  }
  request = load('api/request.js', p => p.includes('config/env') ? env : p.includes('mini-log') ? log : store);
  auth = load('api/modules/auth-api.js', () => request);
  const api = {wxLogin:auth.wxLogin, getUserProfile: () => request.request({url:'/user/profile'}), bindDistribution: () => request.request({url:'/distribution/bind'})};
  const patientContext = load('stores/patient-context-store.js', () => ({loadPatientContext:opts.patientContext || (async()=>({members:[],currentMember:null,currentPatientId:''}))}));
  store = load('stores/session-store.js', p => p.includes('patient-context-store') ? patientContext : p.includes('mini-log') ? log : p.includes('auth-api') ? auth : api);
  load('pages/auth/login.js', p => p.includes('session-store') ? store : p.includes('mini-log') ? log : env);
  page.onLoad(opts.query || {});
  return {page,store,request,storage,calls,toasts,modals,nav,timers,patientContext, get loading(){return loading;},get hideCount(){return hideCount;},externalLoading:()=>{loading=true;},
    authCalls: () => calls.filter(c=>c.url.includes('/auth/')),
    ready: () => Object.assign(page.data,{agreed:true,phone:'13800000000',password:'fixture-password',showPasswordLoginModal:true}),
    flush: () => {const pending=[...timers.values()];timers.clear();pending.forEach(f=>f());}
  };
}
const cases=[];
const test=(name,fn)=>cases.push({name,fn});
test('UI-01 initial consent/modal/submitting are false',()=>{const h=harness();assert.equal(h.page.data.agreed,false);assert.equal(h.page.data.submitting,false);assert.equal(h.page.data.showPasswordLoginModal,false);});
test('UI-02 template password masked and both submit methods guarded',()=>{const s=fs.readFileSync(path.join(root,'pages/auth/login.wxml'),'utf8');assert.match(s,/password="\{\{true\}\}"/);assert.equal((s.match(/disabled="\{\{submitting\}\}"/g)||[]).length,3);});
test('UI-03 linked agreement/privacy pages registered and files exist',()=>{const h=harness();h.page.viewAgreement();h.page.viewPrivacy();const app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));for(const [,url] of h.nav){assert.ok(app.pages.includes(url.slice(1)));assert.ok(fs.existsSync(path.join(root,url.slice(1)+'.wxml')));}});
test('CONSENT-01 password modal blocked before agreement',()=>{const h=harness();h.page.openPasswordLoginModal();assert.equal(h.page.data.showPasswordLoginModal,false);assert.equal(h.toasts.length,1);});
test('CONSENT-02 agreement/revoke respected',()=>{const h=harness();h.page.handleAgreementChange({detail:{value:['agree']}});h.page.openPasswordLoginModal();assert.equal(h.page.data.showPasswordLoginModal,true);h.page.closePasswordLoginModal();h.page.handleAgreementChange({detail:{value:[]}});h.page.openPasswordLoginModal();assert.equal(h.page.data.showPasswordLoginModal,false);});
for(const mode of ['password','wechat']) test(`CONSENT-03 ${mode} callback cannot bypass consent`,async()=>{const h=harness();h.ready();h.page.data.agreed=false;await (mode==='password'?h.page.onPasswordLoginTap():h.page.onGetPhoneNumber({detail:{code:'fixture'}}));assert.equal(h.authCalls().length,0);});
for(const phone of ['', '123','1380000000','138000000000','23800000000','138abc00000']) test(`INPUT phone rejected [${phone||'empty'}]`,async()=>{const h=harness();h.ready();h.page.data.phone=phone;await h.page.onPasswordLoginTap();assert.equal(h.authCalls().length,0);assert.equal(h.toasts.length,1);});
test('INPUT empty password rejected',async()=>{const h=harness();h.ready();h.page.data.password='';await h.page.onPasswordLoginTap();assert.equal(h.authCalls().length,0);});
test('INPUT phone sanitization and 11 digit maximum',()=>{const h=harness();h.page.handlePhoneInput({detail:{value:'138-0000 0000123abc'}});assert.equal(h.page.data.phone,'13800000000');});
test('INPUT password maximum 20 and whitespace preserved',()=>{const h=harness();h.page.handlePasswordInput({detail:{value:' abcdefghijklmnopqrstuvwxyz'}});assert.equal(h.page.data.password.length,20);assert.ok(h.page.data.password.startsWith(' '));});
test('INPUT explicit cancel clears credentials',()=>{const h=harness();h.ready();h.page.closePasswordLoginModal();assert.equal(h.page.data.phone,'');assert.equal(h.page.data.password,'');});
for(const mode of ['password','wechat']) {
  const submit = h => mode==='password'?h.page.onPasswordLoginTap():h.page.onGetPhoneNumber({detail:{code:'fixture-phone-code'}});
  test(`AUTH ${mode} successful token/profile/single redirect`,async()=>{const h=harness();h.ready();await submit(h);assert.equal(h.store.isLoggedIn(),true);assert.equal(h.store.getAuthMode(),mode);assert.equal(h.modals.length,0);assert.equal(h.loading,false);h.flush();assert.equal(h.nav.length,1);assert.equal(h.page.data.password,'');});
  for(const status of [400,401,403,404,429,500,'network','missing-token']) test(`AUTH ${mode} failure ${status}`,async()=>{const h=harness({response:o=>o.url.includes('/auth/') ? status==='network'?{network:true}:status==='missing-token'?{statusCode:200,data:{data:{}}}:{statusCode:status,data:{message:'fixture rejection'}}:undefined});h.ready();await submit(h);h.flush();assert.equal(h.store.isLoggedIn(),false);assert.equal(h.modals.length,1);assert.equal(h.nav.length,0);assert.equal(h.page.data.submitting,false);assert.equal(h.loading,false);assert.equal(h.page.data.password,'fixture-password');});
  for(const status of [401,500,'network']) test(`PROFILE ${mode} ${status}`,async()=>{const h=harness({response:o=>o.url.endsWith('/user/profile')?status==='network'?{network:true}:{statusCode:status,data:{message:'fixture profile rejection'}}:undefined});h.ready();await submit(h);h.flush();assert.equal(h.store.isLoggedIn(),status!==401);assert.equal(h.nav.length,status===401?0:1);assert.equal(h.modals.length,status===401?1:0);if(status!==401)assert.ok(h.toasts.includes('登录成功，资料暂未加载'));});
  test(`CONCURRENCY ${mode} 20 submissions plus other method`,async()=>{const h=harness();h.ready();const jobs=Array.from({length:20},()=>submit(h));jobs.push(mode==='password'?h.page.onGetPhoneNumber({detail:{code:'fixture'}}):h.page.onPasswordLoginTap());await Promise.all(jobs);await submit(h);assert.equal(h.authCalls().length,1);h.flush();assert.equal(h.nav.length,1);});
  test(`LIFECYCLE ${mode} unload cancels delayed navigation`,async()=>{const h=harness();h.ready();await submit(h);h.page.onUnload();h.flush();assert.equal(h.nav.length,0);});
}
test('WX cancelled authorization does not authenticate',async()=>{const h=harness();h.ready();await h.page.onGetPhoneNumber({detail:{errMsg:'getPhoneNumber:fail user deny'}});assert.equal(h.authCalls().length,0);assert.equal(h.page.data.submitting,false);});
test('WX wx.login failure releases submission lock',async()=>{const h=harness({wxFail:true});h.ready();await h.page.onGetPhoneNumber({detail:{code:'fixture'}});assert.equal(h.authCalls().length,0);assert.equal(h.modals.length,1);assert.equal(h.page.data.submitting,false);});
test('WX error text is limited to 120 characters',async()=>{const h=harness();await h.page.onLoginOpenTypeError({detail:{errMsg:'x'.repeat(300)}});assert.equal(h.modals[0].content.length,120);});
for(const [redirect,type,url] of [['','tab','/pages/profile/index'],['https://example.invalid','tab','/pages/profile/index'],['/pages/product/index?a=1','tab','/pages/product/index'],['/pages/auth/privacy/index?a=1','relaunch','/pages/auth/privacy/index?a=1']]) test(`NAV redirect ${redirect||'default'}`,()=>{const h=harness({query:{redirect:encodeURIComponent(redirect)}});h.page.navigateAfterLogin();assert.deepEqual(h.nav,[[type,url]]);});
test('NAV return uses stack',()=>{const h=harness({pages:[{},{}]});h.page.handleBack();assert.deepEqual(h.nav,[['back',1]]);});
test('NAV return stack failure uses home fallback',()=>{const h=harness({pages:[{},{}],backFail:true});h.page.handleBack();assert.deepEqual(h.nav,[['back',1],['tab','/pages/index/index']]);});
test('NAV explicit return query preserved',()=>{const h=harness({query:{back:encodeURIComponent('/pages/auth/privacy/index?a=1')}});h.page.handleBack();assert.deepEqual(h.nav,[['relaunch','/pages/auth/privacy/index?a=1']]);});
test('NAV failure releases submission lock',()=>{const h=harness({navFail:true});h.page.data.submitting=true;h.page.navigateAfterLogin();assert.equal(h.page.data.submitting,false);assert.equal(h.toasts.length,1);});
test('SESSION valid stored token restores authentication',()=>{const h=harness({storage:{access_token:token('a'),auth_mode:'password'}});assert.equal(h.store.isLoggedIn(),true);assert.equal(h.store.getAuthMode(),'password');});
for (const status of ['bound','already_bound','ignored_self']) test(`INVITE ${status} removes pending invitation`,async()=>{const h=harness({storage:{pending_invite_code:'fixture-invite'},response:o=>o.url.endsWith('/distribution/bind')?{statusCode:200,data:{data:{status}}}:undefined});h.ready();await h.page.onPasswordLoginTap();assert.equal(h.storage.has('pending_invite_code'),false);assert.equal(h.store.isLoggedIn(),true);});
test('INVITE transient failure retains invitation without failing login',async()=>{const h=harness({storage:{pending_invite_code:'fixture-invite'},response:o=>o.url.endsWith('/distribution/bind')?{network:true}:undefined});h.ready();await h.page.onPasswordLoginTap();assert.equal(h.storage.has('pending_invite_code'),true);assert.equal(h.store.isLoggedIn(),true);assert.equal(h.modals.length,0);});
test('SESSION expired token not authenticated',()=>{const expired=`e30.${Buffer.from('{"exp":1}').toString('base64url')}.sig`;const h=harness({storage:{access_token:expired}});assert.equal(h.store.isLoggedIn(),false);});
test('SESSION invalid token format rejected',()=>{const h=harness({storage:{access_token:'invalid'}});assert.equal(h.store.isLoggedIn(),false);});
test('SESSION logout isolates patient and preserves pending private caches',()=>{const h=harness({storage:{access_token:token('a'),auth_mode:'wechat',current_patient_id:'patient-a',last_local_snore_result:{},pending_snore_uploads:[],pending_appointment_assessment:{}}});h.store.logout();for(const key of ['access_token','auth_mode','current_patient_id','last_local_snore_result','pending_snore_uploads','pending_appointment_assessment'])assert.equal(h.storage.has(key),false);assert.equal(h.store.state.currentPatientId,'');assert.equal(h.storage.get('account_cache_archive')[0].owner,'a');});
for(const refresh of ['success','503','network','missing-token','wx-fail']) test(`REFRESH 30 concurrent ${refresh}`,async()=>{let retry=false;const h=harness({wxFail:refresh==='wx-fail',storage:{access_token:token('old'),auth_mode:'wechat'},response:async o=>{if(o.url.includes('/auth/')){await tick();retry=true;return refresh==='503'?{statusCode:503,data:{}}:refresh==='network'?{network:true}:refresh==='missing-token'?{statusCode:200,data:{}}:undefined;}return retry&&refresh==='success'?{statusCode:200,data:{ok:true}}:{statusCode:401,data:{}};}});const results=await Promise.allSettled(Array.from({length:30},()=>h.request.request({url:'/user/profile'})));assert.equal(results.length,30);assert.ok(results.every(r=>r.status===(refresh==='success'?'fulfilled':'rejected')));assert.equal(h.authCalls().length,refresh==='wx-fail'?0:1);});
test('RETRY failed password auth can be resubmitted',async()=>{let rejected=true;const h=harness({response:o=>rejected&&o.url.includes('/auth/')?{statusCode:400,data:{}}:undefined});h.ready();await h.page.onPasswordLoginTap();rejected=false;await h.page.onPasswordLoginTap();assert.equal(h.store.isLoggedIn(),true);assert.equal(h.authCalls().length,2);});
// Desired-behaviour assertions below deliberately fail when a defect is present.
test('EDGE diagnostic log delay must not prevent auth request',async()=>{const g=gate();const h=harness({log:e=>e.event==='session_password_login_start_sync'?g.promise:undefined});h.ready();const p=h.page.onPasswordLoginTap();await tick();const count=h.authCalls().length;g.resolve();await p;assert.ok(count>0,'authCalls while diagnostics pending = 0');});
test('EDGE unloading before session starts must cancel auth',async()=>{const g=gate();let h;h=harness({log:e=>{if(e.event==='login_session_start_sync'){h.page.onUnload();return g.promise;}}});h.ready();const p=h.page.onGetPhoneNumber({detail:{code:'fixture'}});await tick();g.resolve();await p;assert.equal(h.authCalls().length,0,'authentication started after unload');});
test('EDGE stale original 401 must not clear a newer session',async()=>{const g=gate();const h=harness({storage:{access_token:token('a'),auth_mode:'password'},response:()=>g.promise});const p=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();h.store.setAccessToken(token('b'));g.resolve({statusCode:401,data:{}});await p;assert.equal(h.store.isLoggedIn(),true,'new session cleared by old request');});
test('EDGE logout during refresh must remain logged out',async()=>{const g=gate();let retry=false;const h=harness({storage:{access_token:token('a'),auth_mode:'wechat'},response:async o=>{if(o.url.includes('/auth/')){await g.promise;retry=true;return undefined;}return {statusCode:retry?200:401,data:{}};}});const p=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();h.store.logout();g.resolve();await p;assert.equal(h.store.isLoggedIn(),false,'refresh restored session after explicit logout');});
test('EDGE late open-type error must not show dialog after unload',async()=>{const g=gate();let h;h=harness({log:()=>{h.page.onUnload();return g.promise;}});const p=h.page.onLoginOpenTypeError({detail:{errMsg:'fixture error'}});g.resolve();await p;await h.page.onLoginOpenTypeError({detail:{errMsg:'late callback'}});assert.equal(h.modals.length,0,'dialog shown after unload');});
test('EDGE renewed account must not inherit previous patient',async()=>{const expired=`e30.${Buffer.from('{"exp":1}').toString('base64url')}.sig`;const h=harness({storage:{access_token:expired,auth_mode:'password',current_patient_id:'old-account-patient',pending_snore_uploads:['old-account-record']}});h.ready();await h.page.onPasswordLoginTap();assert.equal(h.store.state.currentPatientId,'','previous patient still selected');assert.equal(h.storage.has('pending_snore_uploads'),false);});
test('EDGE token with undecodable payload is not authenticated',()=>{const h=harness({storage:{access_token:'a.b.c'}});assert.equal(h.store.isLoggedIn(),false,'undecodable JWT accepted as local login');});
test('EDGE development environment switch also moves diagnostic destination',async()=>{
  const storage=new Map(), urls=[];
  const wx={getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getSystemInfoSync:()=>({}),request:o=>{urls.push(o.url);o.success({statusCode:200});}};
  const envContext={module:{exports:{}},wx};
  vm.runInNewContext(fs.readFileSync(path.join(root,'common/config/env.js'),'utf8'),envContext);
  const env=envContext.module.exports;
  const ctx={module:{exports:{}},wx,require:()=>env,getCurrentPages:()=>[],console:quiet};
  vm.runInNewContext(fs.readFileSync(path.join(root,'common/utils/mini-log.js'),'utf8'),ctx);
  env.setApiEnvOverride('production');
  await ctx.module.exports.reportNow({event:'fixture'});
  assert.equal(urls[0],env.getApiBaseUrl()+'/logs/mini-program','diagnostic URL remains previous environment (requests mocked)');
});
test('RISK unload during auth balances loading calls (visual result untested)',async()=>{const g=gate();const h=harness({response:async o=>{if(o.url.includes('/auth/'))await g.promise;return undefined;}});h.ready();const p=h.page.onPasswordLoginTap();await tick();h.page.onUnload();g.resolve();await p;assert.equal(h.loading,false,'showLoading not balanced by hideLoading');});
// Focused developer checks for cancellation and diagnostics; no real HTTP.
test('FIX cancellation while wx.login pending prevents API request',async()=>{
  let callback;
  const h=harness({wxLogin:o=>{callback=o;}});
  h.ready();
  const pending=h.page.onGetPhoneNumber({detail:{code:'fixture'}});
  await tick();assert.ok(callback);h.page.onUnload();
  callback.success({code:'fixture-code'});await pending;
  assert.equal(h.authCalls().length,0);assert.equal(h.store.isLoggedIn(),false);
});
for(const mode of ['password','wechat']) test('FIX '+mode+' cancelled response cannot commit session',async()=>{
  const g=gate();const h=harness({response:async o=>{if(o.url.includes('/auth/'))await g.promise;return undefined;}});
  h.ready();const pending=mode==='password'?h.page.onPasswordLoginTap():h.page.onGetPhoneNumber({detail:{code:'fixture'}});
  await tick();assert.equal(h.authCalls().length,1);h.page.onUnload();g.resolve();await pending;
  assert.equal(h.store.isLoggedIn(),false);assert.equal(h.nav.length,0);assert.equal(h.modals.length,0);
});
test('FIX rejecting diagnostics do not fail successful login',async()=>{
  const h=harness({log:()=>Promise.reject(Error('diagnostic failure'))});h.ready();
  await h.page.onPasswordLoginTap();await tick();assert.equal(h.store.isLoggedIn(),true);assert.equal(h.modals.length,0);
});
test('FIX refresh response cannot overwrite replacement session',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('old'),auth_mode:'wechat'},response:async o=>{
    if(o.url.includes('/auth/')){await g.promise;return undefined;}return {statusCode:401,data:{}};
  }});
  const p=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();
  h.store.setAccessToken(token('replacement'));h.store.setAuthMode('password');g.resolve();await p;
  assert.equal(h.store.getAccessToken(),token('replacement'));assert.equal(h.store.getAuthMode(),'password');
});
test('FIX same-token replacement still protects session generation',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('same'),auth_mode:'password'},response:()=>g.promise});
  const p=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();
  h.store.setAccessToken(token('same'));g.resolve({statusCode:401,data:{}});await p;
  assert.equal(h.store.isLoggedIn(),true);
});
// Independent regression additions: session races, lifecycle stages and diagnostics.
test('REG BUG-01 refresh without wx code settles 30 callers',async()=>{
  const h=harness({wxResult:{},storage:{access_token:token('old'),auth_mode:'wechat'},response:()=>({statusCode:401,data:{}})});
  const results=await Promise.allSettled(Array.from({length:30},()=>h.request.request({url:'/user/profile'})));
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal(h.authCalls().length,0);
});
test('REG BUG-01 failed refresh permits later fresh login and refresh',async()=>{
  let failing=true,retried=false;
  const h=harness({storage:{access_token:token('old'),auth_mode:'wechat'},response:o=>{
    if(o.url.includes('/auth/')) {if(failing)return {statusCode:503,data:{}};retried=true;return undefined;}
    return {statusCode:retried?200:401,data:{ok:true}};
  }});
  await assert.rejects(h.request.request({url:'/user/profile'}));
  failing=false;h.store.setAccessToken(token('fresh'));h.store.setAuthMode('wechat');
  await h.request.request({url:'/user/profile'});assert.equal(h.authCalls().length,2);
});
test('REG BUG-05 all wechat diagnostic promises may remain pending',async()=>{
  const g=gate();const h=harness({log:()=>g.promise});h.ready();
  const p=h.page.onGetPhoneNumber({detail:{code:'fixture'}});await tick();
  const finished=h.toasts.includes('登录成功');g.resolve();await p;
  assert.equal(finished,true,'successful login waited for logging');
});
test('REG BUG-07 delayed retry 401 preserves replacement session',async()=>{
  const g=gate();let refreshed=false;
  const h=harness({storage:{access_token:token('old'),auth_mode:'wechat'},response:o=>{
    if(o.url.includes('/auth/')){refreshed=true;return undefined;}
    return refreshed?g.promise:{statusCode:401,data:{}};
  }});
  const p=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();
  assert.equal(h.calls.filter(c=>c.url.endsWith('/user/profile')).length,2);
  h.store.setAccessToken(token('replacement'));h.store.setAuthMode('password');
  g.resolve({statusCode:401,data:{}});await p;assert.equal(h.store.getAccessToken(),token('replacement'));
});
test('REG BUG-08 logout cancels all 30 refresh waiters without reauthentication',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('old'),auth_mode:'wechat'},response:async o=>{
    if(o.url.includes('/auth/')){await g.promise;return undefined;}return {statusCode:401,data:{}};
  }});
  const pending=Promise.allSettled(Array.from({length:30},()=>h.request.request({url:'/user/profile'})));
  await tick();h.store.logout();g.resolve();const results=await pending;
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal(h.store.isLoggedIn(),false);
  assert.equal(h.authCalls().length,1);assert.equal(h.calls.length,31);
});
test('REG BUG-08 logout before wx refresh callback prevents auth request',async()=>{
  let callback;const h=harness({wxLogin:o=>{callback=o;},storage:{access_token:token('old'),auth_mode:'wechat'},response:()=>({statusCode:401,data:{}})});
  const pending=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();assert.ok(callback);
  h.store.logout();callback.success({code:'fixture'});await pending;
  assert.equal(h.authCalls().length,0);assert.equal(h.store.isLoggedIn(),false);
});
for(const payload of [null,[],{}, {exp:'4102444800'},{exp:0},{exp:-1}]) test('REG BUG-10 invalid payload '+JSON.stringify(payload),()=>{
  const invalid=`e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  const h=harness({storage:{access_token:invalid}});assert.equal(h.store.isLoggedIn(),false);assert.equal(h.storage.has('access_token'),false);
});
for(const initial of ['local','production']) test('REG BUG-11 normal and immediate logs follow switch from '+initial,async()=>{
  const storage=new Map([['debug_api_env_override',initial]]),urls=[];
  const wx={getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getSystemInfoSync:()=>({}),request:o=>{urls.push(o.url);o.success({statusCode:200});if(o.complete)o.complete();}};
  const envContext={module:{exports:{}},wx};vm.runInNewContext(fs.readFileSync(path.join(root,'common/config/env.js'),'utf8'),envContext);
  const env=envContext.module.exports,ctx={module:{exports:{}},wx,require:()=>env,getCurrentPages:()=>[],console:quiet};
  vm.runInNewContext(fs.readFileSync(path.join(root,'common/utils/mini-log.js'),'utf8'),ctx);
  env.setApiEnvOverride(initial==='local'?'production':'local');
  ctx.module.exports.report({event:'fixture'});await ctx.module.exports.reportNow({event:'fixture'});
  assert.equal(urls.length,2);assert.ok(urls.every(u=>u===env.getApiBaseUrl()+'/logs/mini-program'));
});
for(const mode of ['password','wechat']) test('REG RISK-01 '+mode+' unload during profile balances loading',async()=>{
  const g=gate();const h=harness({response:o=>o.url.endsWith('/user/profile')?g.promise:undefined});h.ready();
  const pending=mode==='password'?h.page.onPasswordLoginTap():h.page.onGetPhoneNumber({detail:{code:'fixture'}});
  await tick();assert.equal(h.store.isLoggedIn(),true);assert.equal(h.loading,true);h.page.onUnload();
  g.resolve({statusCode:200,data:{data:{id:'user'}}});await pending;
  assert.equal(h.nav.length,0);assert.equal(h.loading,false,'profile success after unload leaves showLoading unmatched');
});
test('REG stale successful profile must not overwrite replacement account profile',async()=>{
  const g=gate();let profileCalls=0;
  const h=harness({storage:{access_token:token('old'),auth_mode:'password'},response:o=>{
    if(o.url.endsWith('/user/profile') && ++profileCalls===1)return g.promise;
    return undefined;
  }});
  const old=h.store.fetchProfile().catch(()=>{});await tick();
  h.store.logout();h.ready();await h.page.onPasswordLoginTap();
  assert.equal(h.store.isLoggedIn(),true);assert.ok(h.toasts.includes('登录成功'));
  assert.equal(h.store.state.profile.id,'user');g.resolve({statusCode:200,data:{data:{id:'old-account'}}});await old;
  assert.equal(h.store.state.profile.id,'user','late old profile replaced current account profile');
});
test('FIX12 late profile after logout is rejected without restoring profile',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('a'),auth_mode:'password'},response:()=>g.promise});
  const pending=h.store.fetchProfile();const rejected=assert.rejects(pending,e=>e.code==='SESSION_CHANGED');
  await tick();h.store.logout();g.resolve({statusCode:200,data:{data:{id:'a'}}});await rejected;
  assert.equal(h.store.state.profile,null);assert.equal(h.store.isLoggedIn(),false);
});
test('FIX12 same-token new login still rejects old profile',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('a'),auth_mode:'password'},response:()=>g.promise});
  const pending=h.store.fetchProfile();const rejected=assert.rejects(pending,e=>e.code==='SESSION_CHANGED');
  await tick();h.store.setAccessToken(token('a'));h.store.state.profile={id:'new-session'};
  g.resolve({statusCode:200,data:{data:{id:'old-session'}}});await rejected;
  assert.equal(h.store.state.profile.id,'new-session');
});
test('FIX12 automatic token refresh still allows current profile response',async()=>{
  let refreshed=false;
  const h=harness({storage:{access_token:token('user'),auth_mode:'wechat'},response:o=>{
    if(o.url.includes('/auth/')){refreshed=true;return undefined;}
    return refreshed?{statusCode:200,data:{data:{id:'user'}}}:{statusCode:401,data:{}};
  }});
  const result=await h.store.fetchProfile();assert.equal(result.id,'user');assert.equal(h.store.state.profile.id,'user');
  assert.equal(h.authCalls().length,1);
});
test('FIX12 account switch while refreshed profile is pending rejects old data',async()=>{
  const g=gate();let refreshed=false;
  const h=harness({storage:{access_token:token('a'),auth_mode:'wechat'},response:o=>{
    if(o.url.includes('/auth/')){refreshed=true;return undefined;}
    return refreshed?g.promise:{statusCode:401,data:{}};
  }});
  const pending=h.store.fetchProfile();const rejected=assert.rejects(pending,e=>e.code==='SESSION_CHANGED');
  await tick();assert.equal(h.authCalls().length,1);h.store.setAccessToken(token('b'));h.store.state.profile={id:'b'};
  g.resolve({statusCode:200,data:{data:{id:'a'}}});await rejected;assert.equal(h.store.state.profile.id,'b');
});
for(const mode of ['password','wechat']) test('FIXR loading closes immediately on unload and late failure leaves next page alone '+mode,async()=>{
  const g=gate();const h=harness({response:o=>o.url.endsWith('/user/profile')?g.promise:undefined});h.ready();
  const pending=mode==='password'?h.page.onPasswordLoginTap():h.page.onGetPhoneNumber({detail:{code:'fixture'}});
  await tick();assert.equal(h.loading,true);h.page.onUnload();assert.equal(h.loading,false);assert.equal(h.hideCount,1);
  h.externalLoading();g.resolve({network:true});await pending;
  assert.equal(h.loading,true);assert.equal(h.hideCount,1);
});
test('FIXR unload without login does not hide another page loading',()=>{const h=harness();h.externalLoading();h.page.onUnload();assert.equal(h.loading,true);assert.equal(h.hideCount,0);});
test('FIXR unknown old records are archived not deleted or adopted',async()=>{
  const h=harness({storage:{current_patient_id:'legacy-patient',pending_snore_uploads:['legacy-record']}});h.ready();await h.page.onPasswordLoginTap();
  assert.equal(h.storage.has('pending_snore_uploads'),false);assert.equal(h.store.state.currentPatientId,'');
  assert.equal(h.storage.get('account_cache_archive')[0].values.pending_snore_uploads[0],'legacy-record');
  assert.equal(h.storage.get('account_cache_archive')[0].owner,'');
});
test('FIXR owned pending data restored only when original account logs back in',async()=>{
  let identity='b';const h=harness({storage:{access_token:token('a'),current_patient_id:'patient-a',rewrite_current_patient_id:'patient-a',pending_snore_uploads:[{ownerUserId:'a',id:'pending-a'}]},response:o=>o.url.includes('/auth/')?{statusCode:200,data:{data:{access_token:token(identity),user:{id:identity}}}}:undefined});
  h.patientContext.state.members=[{id:'patient-a'}];await h.store.passwordLogin('13800000000','fixture');
  assert.equal(h.store.state.currentPatientId,'');assert.equal(h.patientContext.state.members.length,0);assert.equal(h.storage.has('pending_snore_uploads'),false);
  identity='a';await h.store.passwordLogin('13800000000','fixture');
  assert.equal(h.storage.get('pending_snore_uploads')[0].id,'pending-a');assert.equal(h.store.state.currentPatientId,'patient-a');
});
test('FIXR late patient context response cannot restore previous members',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('a')},patientContext:()=>g.promise});
  const pending=h.patientContext.refresh();const rejected=assert.rejects(pending,/账号已切换/);
  await h.store.passwordLogin('13800000000','fixture');g.resolve({members:[{id:'old'}],currentMember:{id:'old'},currentPatientId:'old'});await rejected;
  assert.equal(h.patientContext.state.currentMember,null);assert.equal(h.patientContext.state.members.length,0);
});
test('FIXR failed authentication does not move account caches',async()=>{
  const h=harness({storage:{access_token:token('a'),current_patient_id:'patient-a',pending_snore_uploads:['keep']},response:()=>({statusCode:400,data:{}})});
  await assert.rejects(h.store.passwordLogin('13800000000','fixture'));assert.equal(h.storage.get('current_patient_id'),'patient-a');assert.equal(h.storage.has('account_cache_archive'),false);
});
test('REG5 archive write failure must not leave explicitly logged-out session active',()=>{
  const h=harness({storage:{access_token:token('a'),auth_mode:'password',pending_snore_uploads:[{ownerUserId:'a',id:'pending'}]},beforeStorageSet:key=>{if(key==='account_cache_archive')throw Error('fixture storage quota exceeded');}});
  try {h.store.logout();} catch(error) {assert.match(error.message,/storage quota/);}
  assert.equal(h.store.isLoggedIn(),false,'archive storage failure prevented logout; session remains active');
});
test('REG5 archive write failure on account switch preserves previous account and data',async()=>{
  const h=harness({storage:{access_token:token('a'),auth_mode:'password',pending_snore_uploads:[{ownerUserId:'a',id:'pending'}]},beforeStorageSet:key=>{if(key==='account_cache_archive')throw Error('fixture storage quota exceeded');}});
  await assert.rejects(h.store.passwordLogin('13800000000','fixture'),/storage quota/);
  assert.equal(h.store.getAccessToken(),token('a'));assert.equal(h.storage.get('pending_snore_uploads')[0].id,'pending');
});
test('REG5 expired account cache ownership survives restart and switching back',async()=>{
  const expired=`e30.${Buffer.from(JSON.stringify({id:'a',exp:1})).toString('base64url')}.sig`;
  const first=harness({storage:{access_token:expired,current_patient_id:'patient-a',pending_snore_uploads:[{ownerUserId:'a',id:'pending-a'}]}});
  assert.equal(first.store.isLoggedIn(),false);assert.equal(first.storage.get('account_cache_owner'),'a');
  let identity='b';const second=harness({storage:structuredClone(Object.fromEntries(first.storage)),response:o=>o.url.includes('/auth/')?{statusCode:200,data:{data:{access_token:token(identity),user:{id:identity}}}}:undefined});
  await second.store.passwordLogin('13800000000','fixture');assert.equal(second.storage.has('pending_snore_uploads'),false);
  identity='a';await second.store.passwordLogin('13800000000','fixture');assert.equal(second.storage.get('pending_snore_uploads')[0].id,'pending-a');
});
test('FIX13 logout archive failure clears auth and members without losing pending records',()=>{
  const h=harness({storage:{access_token:token('a'),auth_mode:'password',current_patient_id:'patient-a',rewrite_current_patient_id:'patient-a',pending_snore_uploads:[{ownerUserId:'a',id:'pending'}]},beforeStorageSet:key=>{if(key==='account_cache_archive')throw Error('fixture quota');}});
  h.store.state.profile={id:'a'};h.patientContext.state.members=[{id:'patient-a'}];
  assert.doesNotThrow(()=>h.store.logout());assert.doesNotThrow(()=>h.store.logout());
  assert.equal(h.store.isLoggedIn(),false);assert.equal(h.store.getAuthMode(),'');assert.equal(h.store.state.profile,null);
  assert.equal(h.store.state.currentPatientId,'');assert.equal(h.patientContext.state.members.length,0);
  assert.equal(h.patientContext.state.currentPatientId,'');assert.equal(h.storage.get('pending_snore_uploads')[0].id,'pending');
  assert.equal(h.storage.get('account_cache_owner'),'a');
});
test('FIX13 archive failure blocks new account until recovery and retains old records',async()=>{
  let fail=true,identity='b';
  const h=harness({storage:{access_token:token('a'),auth_mode:'password',pending_snore_uploads:[{ownerUserId:'a',id:'pending-a'}]},beforeStorageSet:key=>{if(fail&&key==='account_cache_archive')throw Error('fixture quota');},response:o=>o.url.includes('/auth/')?{statusCode:200,data:{data:{access_token:token(identity),user:{id:identity}}}}:undefined});
  h.store.logout();await assert.rejects(h.store.passwordLogin('13800000000','fixture'),/quota/);
  assert.equal(h.store.isLoggedIn(),false);assert.equal(h.storage.get('pending_snore_uploads')[0].ownerUserId,'a');
  fail=false;await h.store.passwordLogin('13800000000','fixture');assert.equal(h.store.state.profile.id,'b');assert.equal(h.storage.has('pending_snore_uploads'),false);
  identity='a';await h.store.passwordLogin('13800000000','fixture');assert.equal(h.storage.get('pending_snore_uploads')[0].id,'pending-a');
});
test('FIX13 pending refresh cannot resurrect session after archive failure on logout',async()=>{
  const g=gate();const h=harness({storage:{access_token:token('a'),auth_mode:'wechat',pending_snore_uploads:[{ownerUserId:'a',id:'pending'}]},beforeStorageSet:key=>{if(key==='account_cache_archive')throw Error('fixture quota');},response:async o=>{if(o.url.includes('/auth/')){await g.promise;return undefined;}return {statusCode:401,data:{}};}});
  const pending=h.request.request({url:'/user/profile'}).catch(()=>{});await tick();h.store.logout();g.resolve();await pending;
  assert.equal(h.store.isLoggedIn(),false);assert.equal(h.storage.get('pending_snore_uploads')[0].id,'pending');
});
const filter = process.env.LOGIN_TEST_FILTER ? new RegExp(process.env.LOGIN_TEST_FILTER) : null;
const selected = cases.filter(c => !filter || filter.test(c.name));
if (!selected.length) throw new Error('No matching test cases');
(async()=>{let failures=0;for(const c of selected){let timeout;try{await Promise.race([c.fn(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('test timeout 3000 ms')),3000);})]);console.log(`PASS ${c.name}`);}catch(e){failures++;console.log(`FAIL ${c.name}: ${e.message}`);}finally{clearTimeout(timeout);}}console.log(`TOTAL ${selected.length} PASS ${selected.length-failures} FAIL ${failures}`);process.exitCode=failures?1:0;})();
