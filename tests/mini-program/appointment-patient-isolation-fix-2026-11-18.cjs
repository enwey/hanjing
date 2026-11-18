// Targeted development checks; preserve independent regression evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const helper=path.join(__dirname,'appointment-audit-2026-11-18.cjs'),fixture={exports:{}};
const out=path.join(__dirname,'artifacts/appointment-patient-isolation-fix-2026-11-18');
vm.runInNewContext(fs.readFileSync(helper,'utf8').split('(async()=>{')[0].replaceAll('artifacts/appointment-audit-2026-11-18','artifacts/appointment-patient-isolation-fix-2026-11-18/helpers')+'\nmodule.exports={create,loadPage,confirmApi,gate,tick,token,members};',{
  require:createRequire(helper),__dirname,module:fixture,Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {create,loadPage,confirmApi,gate,tick,token,members}=fixture.exports;
const results=[],previews=[];
const swap=h=>{h.store.logout();h.store.switchAccount('b');h.store.setAccessToken(token('b'));h.store.setAuthMode('wechat');};
function scenario(){
  const h=create({response:()=>({statusCode:200,data:{data:members}})}),api=confirmApi(h);let creates=0;
  api.createAppointment=async()=>{creates++;return {data:{id:'new',status:'pending'}};};
  return {h,api,s:loadPage('confirm.js',h,api),creates:()=>creates};
}
async function check(name,fn){try{await fn();results.push({name,result:'passed'});}catch(e){results.push({name,result:'failed',error:e.message});}console.log(`${results.at(-1).result.toUpperCase()} ${name}`);}
const empty=page=>{assert.equal(page.data.memberList.length,0);assert.equal(page.data.memberOptions.length,0);assert.equal(page.data.draft,null);assert.equal(page.data.symptomDesc,'');assert.equal(page.data.assessmentLabel,'');};
(async()=>{
  await check('PATIENT-01 replacement load immediately clears old form and cannot submit',async()=>{
    const x=scenario(),g=gate();await x.s.page.loadPage();x.s.page.handleMemberChange({detail:{value:1}});x.s.page.handleSymptomInput({detail:{value:'A的主诉'}});swap(x.h);
    x.api.getFamilyMembers=()=>g.promise;const pending=x.s.page.loadPage({silent:true});
    try{empty(x.s.page);assert.equal(x.s.page.data.hasLoaded,false);await x.s.page.submitAppointment();assert.equal(x.creates(),0);previews.push({title:'换号后等待新资料',data:structuredClone(x.s.page.data)});}
    finally{g.resolve({data:[]});await pending;}
  });
  await check('PATIENT-02 replacement load failure keeps old members absent and shows error',async()=>{
    const x=scenario();await x.s.page.loadPage();swap(x.h);x.api.getFamilyMembers=async()=>{throw Error('加载就诊人失败，请稍后重试');};await x.s.page.loadPage({silent:true});
    empty(x.s.page);assert.equal(x.s.page.data.loading,false);assert.ok(x.s.page.data.loadError);await x.s.page.submitAppointment();assert.equal(x.creates(),0);
    previews.push({title:'新资料加载失败',data:structuredClone(x.s.page.data)});
  });
  await check('PATIENT-03 retry loads and submits only replacement-account patient',async()=>{
    const x=scenario();await x.s.page.loadPage();swap(x.h);x.api.getFamilyMembers=async()=>{throw Error('network');};await x.s.page.loadPage();
    x.api.getFamilyMembers=async()=>({data:[{id:'b-self',name:'新账号就诊人',relation:'self'}]});let submitted;
    x.api.createAppointment=async data=>{submitted=data.patientId;return {data:{id:'b-apt',status:'pending'}};};await x.s.page.loadPage();
    assert.equal(x.s.page.data.memberList.length,1);assert.equal(x.s.page.data.memberList[0].id,'b-self');previews.push({title:'恢复后只显示新账号就诊人',data:structuredClone(x.s.page.data)});
    await x.s.page.submitAppointment();assert.equal(submitted,'b-self');
  });
  await check('PATIENT-04 same-account renewal preserves selected family and symptom',async()=>{
    const x=scenario();await x.s.page.loadPage();x.s.page.handleMemberChange({detail:{value:1}});x.s.page.handleSymptomInput({detail:{value:'当前账号主诉'}});
    x.h.store.setAccessToken(token('a')+'x',{isRefresh:true});await x.s.page.loadPage({silent:true});
    assert.equal(x.s.page.data.memberList[x.s.page.data.memberIndex].id,'family');assert.equal(x.s.page.data.symptomDesc,'当前账号主诉');
  });
  await check('PATIENT-05 missing replacement draft still clears old patient form',async()=>{
    const x=scenario();await x.s.page.loadPage();swap(x.h);x.s.draftStore.clearDraft();await x.s.page.loadPage({silent:true});empty(x.s.page);assert.ok(x.s.page.data.loadError.includes('草稿'));
  });
  await check('PATIENT-06 submit before replacement load rejects old member ownership',async()=>{
    const x=scenario();await x.s.page.loadPage();swap(x.h);await x.s.page.submitAppointment();assert.equal(x.creates(),0);assert.ok(x.s.toasts.some(v=>v.includes('登录状态已变更')));
  });
  await check('PATIENT-07 old submit finally cannot unlock new-account pending submission',async()=>{
    const x=scenario(),a=gate(),b=gate();let calls=0;await x.s.page.loadPage();x.api.createAppointment=()=>++calls===1?a.promise:b.promise;
    const old=x.s.page.submitAppointment();await tick();swap(x.h);x.api.getFamilyMembers=async()=>({data:[{id:'b-self',name:'B',relation:'self'}]});await x.s.page.loadPage();
    const fresh=x.s.page.submitAppointment();await tick();a.resolve({data:{id:'a-apt',status:'pending'}});await old;
    try{assert.equal(x.s.page.data.isSubmitting,true);assert.equal(x.s.nav.length,0);}finally{b.resolve({data:{id:'b-apt',status:'pending'}});await fresh;}
    assert.equal(x.s.nav.length,1);assert.ok(x.s.nav[0].endsWith('b-apt'));
  });
  await check('PATIENT-08 loading/invalid form disables button and WXML tags balance',async()=>{
    const xml=fs.readFileSync(path.join(__dirname,'../../mp-weixin-rewrite/pages/appointment/confirm.wxml'),'utf8');
    assert.ok(xml.includes('wx:if="{{loading && !draft}}"'));assert.ok(xml.includes('disabled="{{loading || isSubmitting || !draft || !memberList.length}}"'));
    const stack=[];const pattern=/<(\/?)([\w-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*(\/?)>/g;
    for(const match of xml.replace(/<!--[\s\S]*?-->/g,'').matchAll(pattern)){
      if(match[1])assert.equal(stack.pop(),match[2]);else if(!match[0].endsWith('/>'))stack.push(match[2]);
    }assert.equal(stack.length,0);
  });
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({phase:'development self-test, not independent regression',results,previews},null,2));
  const root=path.join(__dirname,'../../mp-weixin-rewrite');const css=fs.readFileSync(path.join(root,'pages/appointment/confirm.wxss'),'utf8').replace(/([\d.]+)rpx/g,(_,n)=>Number(n)/2+'px');
  const esc=v=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;');
  const html=previews.map(({title,data})=>`<section><h2>${esc(title)}</h2>${data.draft?`<div class="info-card"><span class="info-title">预约信息确认</span><div class="info-row"><span class="info-label">就诊人</span><span class="info-value">${esc(data.selectedMemberName)}</span></div></div>`:data.loadError?`<div class="state-card"><span class="state-title">加载失败</span><span class="state-description">${esc(data.loadError)}</span></div>`:'<div class="state-card"><span class="state-description">正在加载预约信息...</span></div>'}</section>`).join('');
  fs.writeFileSync(path.join(out,'preview.html'),`<!doctype html><meta charset="utf-8"><style>${css}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f9fafb;font-family:Arial,"Microsoft Yahei",sans-serif}section{width:390px;margin-bottom:24px}h2{font-size:15px;font-weight:500}.state-card{padding:24px;background:white;border-radius:16px}.state-title,.state-description{display:block;line-height:1.8}</style>${html}`);
  process.exitCode=results.some(r=>r.result==='failed')?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
