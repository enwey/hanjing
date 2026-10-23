const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/assessment.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'\nmodule.exports={setup};',box);
const {setup}=box.module.exports,results=[];
const backendSource=fs.readFileSync(__dirname+'/snore-functional.cjs','utf8'),backendBox={require,__dirname,module:{exports:{}}};
vm.runInNewContext(backendSource.slice(0,backendSource.indexOf('\n(async()=>{'))+'\nmodule.exports={backend};',backendBox);
const {backend}=backendBox.module.exports;
async function savedDetail(row) {
 const text=fs.readFileSync(__dirname+'/../../hanjing-clinic-backend/routes/client.js','utf8');
 const start=text.indexOf("app.get('/api/v1/assessments/snore-analysis/:id',"),end=text.indexOf("app.get('/api/v1/community/posts',",start);let handler;
 vm.runInNewContext(text.slice(start,end),{app:{get:(url,...handlers)=>handler=handlers.at(-1)},authenticateWxToken:()=>{},getAccessiblePatientIdsForUser:async()=>[1],buildSqlPlaceholders:()=> '?',get:async()=>row,formatDateTimeInShanghai:()=> '2026-10-22',console:{error:()=>{}}});
 let status=200,payload;const res={status:n=>{status=n;return res;},json:p=>payload=p};await handler({params:{id:'snore-1'},user:{id:10}},res);assert.equal(status,200);return payload.data.snoreAnalysis;
}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
async function show(analysis){const h=setup('snore-result/index',{getAssessmentDetail:async()=>({data:{id:'snore-fixture',type:'ai_snore',snoreAnalysis:analysis}})});h.p.onLoad({id:'snore-fixture'});await h.p.onShow();return h;}
const base={duration:5,avgDecibel:70,peakDecibel:80,snoreRate:60,apneaEvents:0,riskLevel:'moderate'};
(async()=>{
await check('RESULT-01 local analysis and server-shaped report have identical risk score',async()=>{
 const code=fs.readFileSync(__dirname+'/../../mp-weixin-rewrite/pages/assessment/recording/index.js','utf8'),ctx={require:()=>({}),wx:{getRecorderManager:()=>({})},module:{exports:{}}};
 vm.runInNewContext(code.slice(0,code.indexOf('Page({'))+'module.exports={analyzePcmOnClient};',ctx);
 const pcm=new Int16Array(40000);for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(20000*Math.sin(2*Math.PI*200*i/8000));
 const analysis={duration:5,...ctx.module.exports.analyzePcmOnClient(pcm,5)};
 const local=await show(analysis),server=backend();
 const response=await server.call({patientId:1,duration:5,client_side_analysis:true,analysis_result:analysis});
 assert.equal(response.status,200);assert.equal(server.writes[0].args[11],analysis.riskScore);
 const online=await show(response.payload.data.snoreAnalysis);
 const args=server.writes[0].args;
 const persisted=await savedDetail({id:1,user_id:args[0],patient_id:args[1],duration:args[3],avg_decibel:args[4],peak_decibel:args[5],snore_rate:args[6],apnea_events:args[7],risk_level:args[8],risk_score:args[11],analysis_version:args[12]});
 assert.equal((await show(persisted)).p.data.riskScore,analysis.riskScore);
 assert.equal(online.p.data.riskScore,local.p.data.riskScore,`same generated PCM: local=${local.p.data.riskScore}, server-shaped=${online.p.data.riskScore}, level=${analysis.riskLevel}`);
});
await check('RESULT-02 zero apnea count must not claim detected apnea events',async()=>{
 const h=await show(base);assert.equal(h.p.data.statCards[3].value,'0 次');assert.ok(!h.p.data.riskInfo.desc.includes('少量呼吸暂停事件'),'0 events but description says 少量呼吸暂停事件');
});
await check('RESULT-03 malformed explicit risk score must not become a valid zero',async()=>{
 const h=await show({...base,riskLevel:'severe',riskScore:'invalid'});assert.equal(h.p.data.riskInfo,null,`invalid score rendered as ${h.p.data.riskScore} with ${h.p.data.riskInfo?.title}`);
});
await check('RESULT-04 high alias has consistent list and detail severity',async()=>{
 const analysis={...base,riskLevel:'high'},list=setup('index',{getAssessments:async()=>({data:[{id:'snore-fixture',type:'ai_snore',snoreAnalysis:analysis}]})});await list.p.onShow();const detail=await show(analysis);
 assert.notEqual(list.p.data.records[0].levelLabel,'正常',`list=${list.p.data.records[0].levelLabel}, detail=${detail.p.data.riskInfo.title}`);
});
await check('complete report renders four measurement cards',async()=>{const h=await show(base);assert.equal(h.p.data.statCards.length,4);assert.equal(h.p.data.statCards[0].value,'70 dB');assert.equal(h.p.data.statCards[2].value,'60%');});
await check('unknown risk rejects report',async()=>{const h=await show({...base,riskLevel:'unknown'});assert.equal(h.p.data.riskInfo,null);assert.ok(h.p.data.loadError);});
await check('missing measurement rejects report',async()=>{const {avgDecibel,...rest}=base;const h=await show(rest);assert.equal(h.p.data.reportDetail,null);assert.ok(h.p.data.loadError);});
await check('appointment handoff stores current report id',async()=>{const h=await show(base);h.p.goAppointment();assert.equal(h.storage.pending_appointment_assessment.id,'snore-fixture');assert.equal(h.calls[0].url,'/pages/appointment/store-select');});
for (const riskScore of ['invalid','70',NaN,Infinity,-1,101,70.5,0]) {
 await check('RESULT-03 rejects severe score '+String(riskScore),async()=>{
  const analysis={...base,riskLevel:'severe',riskScore};const h=await show(analysis);assert.equal(h.p.data.riskInfo,null);
  assert.equal((await backend().call({patientId:1,duration:5,client_side_analysis:true,analysis_result:analysis})).status,400);
 });
}
await check('RESULT-01 repeat preserves stored score and conflicting score returns409',async()=>{
 const server=backend(),body={localId:'score-check',patientId:1,duration:5,client_side_analysis:true,analysis_result:{...base,riskScore:55}};
 assert.equal((await server.call(body)).payload.data.snoreAnalysis.riskScore,55);
 assert.equal((await server.call(body)).payload.data.snoreAnalysis.riskScore,55);
 assert.equal((await server.call({...body,analysis_result:{...base,riskScore:56}})).status,409);assert.equal(server.writes.length,1);
});
console.log(JSON.stringify({scope:'actual analyzer, pages and POST handler; synthetic PCM, mocked SQL/session; not real database or device',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
