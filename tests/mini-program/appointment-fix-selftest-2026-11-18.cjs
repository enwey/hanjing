// Developer checks for APT-1118-01..05. Preserve original audit evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const filename=path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const source=fs.readFileSync(filename,'utf8').replaceAll('artifacts/appointment-audit-2026-11-18','artifacts/appointment-fix-selftest-2026-11-18/original');
const out=path.join(__dirname,'artifacts/appointment-fix-selftest-2026-11-18');
const context=()=>({require:createRequire(filename),__dirname,Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout});
const observations=[],previews=[];
async function check(name,fn){try{await fn();observations.push({name,result:'passed'});}catch(e){observations.push({name,result:'failed',error:e.message});}console.log(`${observations.at(-1).result.toUpperCase()} ${name}`);}
(async()=>{
  const localProcess={exitCode:0};
  await vm.runInNewContext(source,{...context(),process:localProcess,module:{exports:{}}});
  const fixture={exports:{}};
  vm.runInNewContext(source.split('(async()=>{')[0]+'\nmodule.exports={create,loadPage,confirmApi,gate,tick,token,members};',{...context(),module:fixture});
  const {create,loadPage,confirmApi,gate,tick,token,members}=fixture.exports;
  const authenticated=()=>create({response:()=>({statusCode:200,data:{data:members}})});
  const changeAccount=h=>{h.store.logout();h.store.switchAccount('b');h.store.setAccessToken(token('b'));h.store.setAuthMode('wechat');};
  await check('FIX-01 same-session renewal during create still completes',async()=>{
    const h=authenticated(),api=confirmApi(h);api.createAppointment=async()=>{h.store.setAccessToken(token('a')+'x',{isRefresh:true});return {data:{id:'created',status:'pending'}};};
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();await s.page.submitAppointment();
    assert.equal(s.nav.length,1);assert.equal(s.draftStore.getDraft(),undefined);
  });
  await check('FIX-02 old payment dialog cannot start payment or cancel for replacement account',async()=>{
    const h=authenticated(),api=confirmApi(h);let payments=0,cancels=0;
    api.createAppointment=async()=>({data:{id:'created',status:'pending_payment'}});
    api.payAppointmentDeposit=async()=>{payments++;return {};};api.cancelAppointment=async()=>{cancels++;};
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();await s.page.submitAppointment();changeAccount(h);
    s.draftStore.setDraft({doctorId:'b-draft'});await s.modals[0].success({confirm:true});await s.modals[0].success({confirm:false});
    assert.equal(payments,0);assert.equal(cancels,0);assert.equal(s.nav.length,0);assert.equal(s.draftStore.getDraft().doctorId,'b-draft');
  });
  await check('FIX-03 unloaded confirmation ignores completed create result',async()=>{
    const h=authenticated(),api=confirmApi(h),g=gate();api.createAppointment=()=>g.promise;
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();const pending=s.page.submitAppointment();await tick();s.page.onUnload();
    s.draftStore.setDraft({doctorId:'new-draft'});g.resolve({data:{id:'old',status:'pending'}});await pending;
    assert.equal(s.nav.length,0);assert.equal(s.draftStore.getDraft().doctorId,'new-draft');
  });
  await check('FIX-04 same-token new login rejects previous detail response',async()=>{
    const h=authenticated(),g=gate();const s=loadPage('detail.js',h,{getBookingSettings:async()=>({}),getAppointmentDetail:()=>g.promise});s.page.options={id:'old'};
    const pending=s.page.loadPage();await tick();h.store.setAccessToken(token('a'));
    g.resolve({data:{appointment:{patientName:'旧患者'},doctor:{},store:{}}});await pending;assert.equal(s.page.data.appointmentLoaded,false);
  });
  await check('FIX-05 newly added family selection survives renewal',async()=>{
    let renew=false;const old=token('a'),next=old+'x';
    const h=create({response:o=>o.url.includes('/auth/')?{statusCode:200,data:{data:{access_token:next}}}:renew&&o.header.Authorization==='Bearer '+old?{statusCode:401,data:{}}:{statusCode:200,data:{data:members}}});
    const s=loadPage('confirm.js',h,confirmApi(h));await s.page.loadPage();s.page.selectCreatedPatient('family');renew=true;await s.page.loadPage();
    assert.equal(s.page.data.memberList[s.page.data.memberIndex].id,'family');previews.push({title:'续期后保留家人选择',data:structuredClone(s.page.data)});
  });
  await check('FIX-06 replacement session has no previously loaded detail visible',async()=>{
    const h=authenticated();const s=loadPage('detail.js',h,{getBookingSettings:async()=>({}),getAppointmentDetail:async()=>({data:{appointment:{patientName:'当前就诊人',status:'cancelled'},doctor:{},store:{}}})});s.page.options={id:'own'};
    await s.page.loadPage();assert.equal(s.page.data.statusKey,'cancelled');previews.push({title:'较新详情状态保持已取消',data:structuredClone(s.page.data)});
    h.store.logout();await s.page.loadPage();assert.equal(s.page.data.appointmentLoaded,false);assert.equal(s.page.data.patientName,'');
    previews.push({title:'退出后隐藏预约详情',data:structuredClone(s.page.data)});
  });
  await check('FIX-07 logout during refresh hides previously displayed detail',async()=>{
    const h=authenticated(),g=gate();let blocked=false;
    const payload={data:{appointment:{patientName:'旧就诊人',status:'pending'},doctor:{},store:{}}};
    const s=loadPage('detail.js',h,{getBookingSettings:async()=>({}),getAppointmentDetail:()=>blocked?g.promise:Promise.resolve(payload)});s.page.options={id:'own'};
    await s.page.loadPage();assert.equal(s.page.data.appointmentLoaded,true);blocked=true;const pending=s.page.loadPage({silent:true});
    await tick();h.store.logout();g.resolve(payload);await pending;assert.equal(s.page.data.appointmentLoaded,false);assert.equal(s.page.data.patientName,'');
  });
  const original=JSON.parse(fs.readFileSync(path.join(out,'original/results.json'),'utf8'));
  fs.mkdirSync(out,{recursive:true});const evidence={phase:'development self-test; not independent regression',originalPassed:original.passed,originalFailed:original.failed,sourceStable:original.sourceStable,observations,previews};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));
  const root=path.join(__dirname,'../../mp-weixin-rewrite');
  const css=['confirm','detail'].map(name=>fs.readFileSync(path.join(root,'pages/appointment',name+'.wxss'),'utf8')).join('\n').replace(/([\d.]+)rpx/g,(_,n)=>Number(n)/2+'px');
  const escape=v=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const markup=previews.map(({title,data})=>`<section><h2>${escape(title)}</h2>${data.selectedMemberName
    ? `<div class="info-card"><span class="info-title">预约信息确认</span><div class="info-row"><span class="info-label">门店</span><span class="info-value">${escape(data.storeName)}</span></div><div class="info-row"><span class="info-label">医生</span><span class="info-value">${escape(data.doctorName)}</span></div><div class="info-row"><span class="info-label">就诊人</span><span class="info-value">${escape(data.selectedMemberName)}</span></div></div>`
    : data.appointmentLoaded ? `<div class="status-hero status--${escape(data.statusKey)}"><span class="status-title">${escape(data.statusLabel)}</span></div><div class="info-card"><div class="info-row"><span class="info-label">就诊人</span><span class="info-value">${escape(data.patientName)}</span></div></div>`
    : `<div class="state-card"><span class="state-title">${escape(data.loadError)}</span></div>`}</section>`).join('');
  fs.writeFileSync(path.join(out,'preview.html'),`<!doctype html><meta charset="utf-8"><style>${css}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f4f6fa;font-family:Arial,"Microsoft Yahei",sans-serif}section{width:390px;margin-bottom:24px}h2{font-size:15px;font-weight:500}.info-label{flex-shrink:0}.status-title{display:block}</style>${markup}`);
  process.exitCode=localProcess.exitCode||observations.some(r=>r.result==='failed')?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
