const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../mp-weixin-rewrite');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=fs.readFileSync(__dirname+'/home.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(src.slice(0,src.indexOf('\n(async()=>{'))+'\nmodule.exports={setup,gate};',box);
const {setup,gate}=box.module.exports,results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function guest(){let p;const calls=[],toasts=[];const wx={navigateTo:o=>calls.push(o),showToast:o=>toasts.push(o.title)};
 const session={isLoggedIn:()=>false},nav={module:{exports:{}},wx,getCurrentPages:()=>[{route:'pages/index/index'}],require:()=>session};
 vm.runInNewContext(read('common/utils/navigation.js'),nav);
 vm.runInNewContext(read('pages/index/index.js'),{Page:o=>p=o,wx,require:s=>s.includes('session-store')?session:s.includes('navigation')?nav.module.exports:{}});
 return {p,calls,toasts};
}
(async()=>{
 const names=['getHomeStats','getDoctors','getStores'];
 for(let mask=0;mask<8;mask++)await test('three API failure matrix '+mask,async()=>{
  const api={};names.forEach((name,i)=>{api[name]=async()=>{if(mask&(1<<i))throw Error('offline');return {data:i===0?{totalPatients:12,satisfactionRate:90,storeCount:1}:[{id:1,name:'fixture',status:'open',isOpen:true}]};};});
  const {p}=setup(api);await p.loadPage();assert.equal(p.data.loading,false);assert.equal(Boolean(p.data.loadError),mask!==0);
  assert.equal(p.data.patientCountLabel,mask&1?'--':'12');assert.equal(p.data.recommendedDoctors.length,mask&2?0:1);assert.equal(p.data.stores.length,mask&4?0:1);
 });
 await test('silent refresh picks up updated statistics',async()=>{let n=1;const {p}=setup({getHomeStats:async()=>({data:{totalPatients:n++}})});await p.onShow();await p.onShow();assert.equal(p.data.patientCountLabel,'2');});
 await test('empty lists are valid successful responses',async()=>{const {p}=setup({getDoctors:async()=>({data:[]}),getStores:async()=>({data:[]})});await p.loadPage();assert.equal(p.data.loadError,'');assert.equal(p.data.recommendedDoctors.length,0);assert.equal(p.data.stores.length,0);});
 await test('HOME-05 guest repeated medical-record taps request one login',()=>{const h=guest();for(let i=0;i<3;i++)h.p.goMedicalRecords();assert.equal(h.calls.length,1,'actual login navigation requests='+h.calls.length);});
 await test('HOME-05 guest login navigation failure has feedback',()=>{const h=guest();h.p.goMedicalRecords();if(h.calls[0].fail)h.calls[0].fail({errMsg:'navigateTo:fail'});assert.ok(h.toasts.length,'navigateTo has no fail callback and produces no feedback');});
 await test('HOME-05 guest medical-record entry respects pending ordinary navigation',()=>{const h=guest();h.p.goStoreSelect();h.p.goMedicalRecords();assert.equal(h.calls.length,1,'actual concurrent navigation requests='+h.calls.length);});
 await test('HOME-06 API failure has an in-page user retry entry',async()=>{const fail=async()=>{throw Error('offline')};const {p}=setup({getHomeStats:fail,getDoctors:fail,getStores:fail});await p.loadPage();const config=JSON.parse(read('pages/index/index.json')),template=read('pages/index/index.wxml');const handlers=[...template.matchAll(/(?:bind|catch)(?::)?tap="([^"]+)"/g)].map(m=>m[1]);const retry=handlers.some(name=>typeof p[name]==='function'&&/loadPage|onShow/.test(p[name].toString()));assert.ok(retry||(config.enablePullDownRefresh&&typeof p.onPullDownRefresh==='function'),'error shown but no in-page retry handler; pull-down refresh disabled');});
 await test('HOME-07 pending initial load has a visible loading state binding',async()=>{const d=gate();const {p}=setup({getDoctors:()=>d.promise});const task=p.loadPage();assert.equal(p.data.loading,true);d.resolve({data:[]});await task;assert.match(read('pages/index/index.wxml'),/\{\{[^}]*\bloading\b[^}]*\}\}/,'loading data is never consumed in the template');});
 await test('HOME-07 successful empty lists have an empty-state indicator',()=>{assert.match(read('pages/index/index.wxml'),/暂无|无医生|无门店|empty|!recommendedDoctors\.length|!stores\.length|\.length\s*===?\s*0/,'no empty-state text, component, or condition');});
 for(const kind of ['doctor','store'])await test(kind+' image load and URL replacement lifecycle',()=>{let c;const imageBox={module:{exports:{}},require:()=>({apiBaseUrl:'http://127.0.0.1:5005/api/v1'})};vm.runInNewContext(read('common/utils/image-url.js'),imageBox);vm.runInNewContext(read('components/business/hj-'+kind+'-card/index.js'),{Component:o=>c=o,require:()=>imageBox.module.exports});c.data={...c.data};c.setData=o=>Object.assign(c.data,o);const field=kind==='doctor'?'avatarUrl':'coverUrl',loaded=kind==='doctor'?'avatarLoaded':'imageLoaded';c.observers[kind].call(c,{name:'fixture',[field]:'/static/demo/doctor-1.jpg'});c.methods[kind==='doctor'?'handleAvatarLoad':'handleImageLoad'].call(c);assert.equal(c.data[loaded],true);c.observers[kind].call(c,{name:'fixture',[field]:'/static/demo/doctor-1.jpg'});assert.equal(c.data[loaded],true);c.observers[kind].call(c,{name:'fixture',[field]:'/static/demo/doctor-2.jpg'});assert.equal(Boolean(c.data[loaded]),false);});
 console.log(JSON.stringify({scope:'home second-round functional checks; actual source, mocked wx/API, template inspection, no device',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
