const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/assessment-round-02.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('(async () => {'))+'module.exports={setup,recording,gate};',box);
const {setup,recording,gate}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function backend(){
 const text=fs.readFileSync(__dirname+'/../../hanjing-clinic-backend/routes/client.js','utf8');
 const start=text.indexOf("app.post('/api/v1/assessments/snore',"),end=text.indexOf('// GET /api/v1/assessments/snore-analysis/:id',start);let handler;const writes=[];
 vm.runInNewContext(text.slice(start,end),{crypto:require('node:crypto'),app:{post:(url,...handlers)=>handler=handlers.at(-1)},authenticateWxToken:()=>{},resolveUserPatient:async req=>{if(req.body.patientId===999)throw Object.assign(Error('not owned'),{statusCode:404});return {id:1};},get:async(sql,args)=>{const i=writes.findIndex(w=>w.args[0]===args[0]&&w.args[9]===args[1]);return i<0?null:{id:i+1,client_payload_hash:writes[i].args[10],risk_score:writes[i].args[11]};},run:async(sql,args)=>{if(args[9]&&writes.some(w=>w.args[0]===args[0]&&w.args[9]===args[9]))throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});writes.push({sql,args});return {id:writes.length};},console:{error:()=>{}}});
 return {writes,call:async body=>{let status=200,payload;const res={status:n=>{status=n;return res;},json:p=>payload=p};await handler({body,user:{id:10}},res);return {status,payload};}};
}
const valid={patientId:1,duration:5,client_side_analysis:true,analysis_result:{avgDecibel:30,peakDecibel:30,snoreRate:0,apneaEvents:0,riskLevel:'normal'}};
(async()=>{
await check('SNORE-01 early recorder stop resets recording state',async()=>{
 const h=setup('recording/index');h.p.onLoad({});Object.assign(h.p.data,{isRecording:true,recordingDurationSeconds:3,disabledSelector:true});h.p._onRecorderStop({tempFilePath:'short.pcm'});await Promise.resolve();assert.equal(h.p.data.isRecording,false,'stopped recorder still marked recording after short stop');
});
await check('SNORE-02 failed member load must prevent recording start',async()=>{
 const h=setup('recording/index',{getFamilyMembers:async()=>{throw Error('offline');}});h.p.onLoad({});await h.p.onShow();let auth,starts=0;h.wx.authorize=o=>auth=o;h.p.dimScreenForRecording=async()=>{};h.recorder.start=()=>starts++;
 await h.p.startRecording();if(auth)await auth.success();assert.equal(starts,0,'recorder started without selected patient');
});
await check('SNORE-03 result rejects missing measurements',async()=>{
 const h=setup('snore-result/index',{getAssessmentDetail:async()=>({data:{id:'incomplete',snoreAnalysis:{riskLevel:'normal'}}})});h.p.onLoad({id:'incomplete'});await h.p.onShow();assert.equal(h.p.data.riskInfo,null,'low-risk report accepted with undefined measurement cards');
});
await check('SNORE-04 repeated upload of same local record does not create twice',async()=>{
 const h=backend(),body={...valid,localId:'same-local-id',timestamp:123456};await h.call(body);await h.call(body);assert.equal(h.writes.length,1,'same localId inserted '+h.writes.length+' times');
});
await check('pause then resume keeps duration and restores recording mode',()=>{
 const h=setup('recording/index');h.p.data.recordingDurationSeconds=8;h.p.data.isRecording=true;h.p.dimScreenForRecording=async()=>{};h.p.pauseRecording();assert.equal(h.p.data.hasRecordingEnded,true);h.p.resumeRecording();assert.equal(h.p.data.recordingDurationSeconds,8);assert.equal(h.p.data.isRecording,true);
});
await check('short PCM file is rejected before submitting',async()=>{
 let n=0;const h=recording({submitSnoreRecording:async()=>{n++;}});h.wx.getFileSystemManager=()=>({readFileSync:()=>new ArrayBuffer(100)});await h.p.submitRecording();assert.equal(n,0);assert.equal(h.p.data.isAnalyzing,false);
});
await check('normal client analysis sends metrics only, no audio',async()=>{
 let sent;const h=recording({submitSnoreRecording:async body=>{sent=body;return {data:{id:'ok'}};}});await h.p.submitRecording();assert.equal(sent.fileData,undefined);assert.equal(sent.client_side_analysis,true);assert.ok(Number.isFinite(sent.analysis_result.snoreRate));
});
await check('pending report submission coalesces duplicate calls',async()=>{
 let n=0;const d=gate(),h=recording({submitSnoreRecording:()=>{n++;return d.promise;}});const first=h.p.submitRecording();await Promise.resolve();await h.p.submitRecording();d.resolve({data:{id:'ok'}});await first;assert.equal(n,1);
});
for(const duration of [4,601,5.5])await check('backend rejects duration '+duration,async()=>{const h=backend(),r=await h.call({...valid,duration});assert.equal(r.status,400);assert.equal(h.writes.length,0);});
await check('backend rejects unowned patient resolver failure',async()=>{const h=backend(),r=await h.call({...valid,patientId:999});assert.equal(r.status,404);assert.equal(h.writes.length,0);});
for(const patch of [{snoreRate:101},{apneaEvents:-1},{peakDecibel:20},{riskLevel:'unknown'}])await check('backend rejects malformed metrics '+JSON.stringify(patch),async()=>{const h=backend(),r=await h.call({...valid,analysis_result:{...valid.analysis_result,...patch}});assert.equal(r.status,400);assert.equal(h.writes.length,0);});
await check('backend accepts five-second valid report',async()=>{const h=backend(),r=await h.call(valid);assert.equal(r.status,200);assert.equal(h.writes.length,1);});
console.log(JSON.stringify({scope:'actual page and snore handler; mocked wx/API/session/ownership resolver/DB; synthetic PCM',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
