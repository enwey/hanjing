const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/home.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(src.slice(0,src.indexOf('\n(async()=>{'))+'\nmodule.exports={setup,gate};',box);
const {setup,gate}=box.module.exports,results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function navHarness(throws=false){let p;const calls=[],toasts=[];const navigate=o=>{calls.push(o);if(throws)throw Error('navigation failure');};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../mp-weixin-rewrite/pages/index/index.js'),'utf8'),{Page:o=>p=o,wx:{navigateTo:navigate,switchTab:navigate,showToast:o=>toasts.push(o.title)},require:()=>({})});
 p.loadPage=async()=>{};return {p,calls,toasts};
}
(async()=>{
 await test('HOME-03 failed navigation releases lock',()=>{const h=navHarness();h.p.goStoreSelect();h.calls[0].fail();h.p.goStoreSelect();assert.equal(h.calls.length,2);assert.equal(h.toasts.length,1);});
 await test('HOME-03 returning onShow releases lock',async()=>{const h=navHarness();h.p.goStoreSelect();await h.p.onShow();h.p.goStoreSelect();assert.equal(h.calls.length,2);});
 await test('HOME-03 synchronous navigation error releases lock',()=>{const h=navHarness(true);h.p.goStoreSelect();h.p.goStoreSelect();assert.equal(h.calls.length,2);assert.equal(h.p._navigationPending,false);});
 await test('HOME-03 different entry blocked while navigation pending',()=>{const h=navHarness();h.p.goStoreSelect();h.p.goAssessment();assert.equal(h.calls.length,1);});
 await test('HOME-01 unload blocks late data update',async()=>{const d=gate();const h=setup({getHomeStats:()=>d.promise});const task=h.p.loadPage();h.p.onUnload();const count=h.writes.length;d.resolve({data:{totalPatients:9}});await task;assert.equal(h.writes.length,count);});
 await test('HOME-02 recovered partial failure clears error',async()=>{let fail=true;const h=setup({getStores:async()=>{if(fail)throw Error('offline');return {data:[]};}});await h.p.loadPage();assert.ok(h.p.data.loadError.includes('门店'));fail=false;await h.p.loadPage();assert.equal(h.p.data.loadError,'');});
 console.log(JSON.stringify({scope:'Actual home page lifecycle and navigation callbacks; mocked wx/API',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
