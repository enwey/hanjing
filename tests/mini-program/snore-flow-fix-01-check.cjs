const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/snore-flow.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(src.slice(0,src.indexOf('\n(async()=>{'))+'module.exports={setup,recording,syncHarness,ctx};',box);
const {setup,recording,syncHarness,ctx}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
(async()=>{
for(const frequency of [100,315,500])await check('spectral peak '+frequency,()=>{const pcm=new Int16Array(8000);for(let i=0;i<8000;i++)pcm[i]=Math.round(20000*Math.sin(2*Math.PI*frequency*i/8000));assert.equal(ctx.module.exports.calculateBandProfile(pcm,0,8000,8000).dominantFrequency,frequency);});
await check('3000Hz noise stays in noise band',()=>{const pcm=new Int16Array(8000);for(let i=0;i<8000;i++)pcm[i]=Math.round(20000*Math.sin(2*Math.PI*3000*i/8000));assert.ok(ctx.module.exports.calculateBandProfile(pcm,0,8000,8000).bandRatio<0.01);});
await check('storage error stops appointment navigation',()=>{const h=setup('snore-result/index');h.p.data.reportDetail={id:'local'};h.wx.setStorageSync=()=>{throw Error('quota');};h.p.goAppointment();assert.equal(h.calls.length,0);assert.equal(h.toasts.length,1);});
await check('failed auto submit releases analysis lock',async()=>{const h=recording({submitSnoreRecording:async()=>{throw Object.assign(Error('invalid'),{statusCode:400});}});h.p.data.isAnalyzing=false;await h.p.submitRecording();assert.equal(h.p.data.isAnalyzing,false);assert.equal(h.p._submittingRecording,false);assert.equal(h.p.data.disabledSelector,false);});
for(const id of ['', 'local', 1, 'snore-0'])await check('unconfirmed id retains queue '+JSON.stringify(id),async()=>{const storage={pending_snore_uploads:[{ownerUserId:'account-B',localId:'x'}]};const api=syncHarness(storage,async()=>({data:{id}}));await assert.rejects(()=>api.syncPendingSnoreRecordings());assert.equal(storage.pending_snore_uploads.length,1);});
console.log(JSON.stringify({scope:'targeted developer checks; mocked wx/SQL/session, synthetic audio',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
