const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/home.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(src.slice(0,src.indexOf('\n(async()=>{'))+'\nmodule.exports={setup,gate};',box);
const {setup,gate}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 await check('retry deduplicates and recovers failed data',async()=>{
  let fail=true,count=0;const d=gate();const {p}=setup({getDoctors:async()=>{count++;if(fail)throw Error('offline');return d.promise;}});
  await p.loadPage();assert.equal(p.data.doctorsLoadFailed,true);fail=false;
  const pending=p.retryLoad();p.retryLoad();assert.equal(count,2);assert.equal(p.data.loading,true);
  d.resolve({data:[]});await pending;assert.equal(p.data.loading,false);assert.equal(p.data.doctorsLoadFailed,false);assert.equal(p.data.loadError,'');
 });
 await check('partial failure distinguishes failed store from empty doctors',async()=>{
  const {p}=setup({getDoctors:async()=>({data:[]}),getStores:async()=>{throw Error('offline');}});await p.loadPage();
  assert.equal(p.data.doctorsLoadFailed,false);assert.equal(p.data.storesLoadFailed,true);assert.equal(p.data.hasLoaded,true);
 });
 await check('unexpected reload error releases loading and preserves retry error',async()=>{
  let fail=false;const {p}=setup({getDoctors:async()=>({data:fail?[null]:[]})});await p.loadPage();fail=true;await p.retryLoad();
  assert.equal(p.data.loading,false);assert.ok(p.data.loadError);assert.equal(p.data.doctorsLoadFailed,true);
 });
 await check('unloaded page ignores retry',async()=>{
  let count=0;const {p}=setup({getDoctors:async()=>{count++;return {data:[]};}});await p.loadPage();p.onUnload();await p.retryLoad();assert.equal(count,1);
 });
 await check('homepage WXML tags balanced',()=>{
  const text=fs.readFileSync(__dirname+'/../../mp-weixin-rewrite/pages/index/index.wxml','utf8').replace(/<!--[^]*?-->/g,'');
  const stack=[];for(const m of text.matchAll(/<\/?([\w-]+)\b(?:[^"'>]|"[^"]*"|'[^']*')*>/g)){
   if(m[0].startsWith('</'))assert.equal(stack.pop(),m[1]);else if(!m[0].endsWith('/>'))stack.push(m[1]);
  }assert.equal(stack.length,0);
 });
 console.log(JSON.stringify({scope:'HOME-05~07 related developer checks only',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results},null,2));
 process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
