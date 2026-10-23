const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/snore-result-functional.cjs','utf8'),ctx={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'module.exports={show,setup,backend,savedDetail,base};',ctx);
const {show,setup,backend,savedDetail,base}=ctx.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
async function listResponse(row){
 const text=fs.readFileSync(__dirname+'/../../hanjing-clinic-backend/routes/client.js','utf8');let handler;
 const start=text.indexOf("app.get('/api/v1/assessments',"),end=text.indexOf('// GET /api/v1/assessments/ess-questions',start);
 vm.runInNewContext(text.slice(start,end),{app:{get:(url,...hs)=>handler=hs.at(-1)},authenticateWxToken:()=>{},getAccessiblePatientIdsForUser:async()=>[1],buildSqlPlaceholders:()=> '?',query:async sql=>sql.includes('FROM snore_assessments')?[row]:[],formatDateTimeInShanghai:()=> '2026-10-22',console:{error:()=>{}}});
 let status=200,payload;const res={status:n=>{status=n;return res;},json:p=>payload=p};await handler({query:{},user:{id:10}},res);assert.equal(status,200);return payload.data;
}
(async()=>{
for(const [level,min,max] of [['normal',0,29],['low',0,29],['mild',30,49],['moderate',50,69],['severe',70,100],['high',70,100]]){
 for(const score of [min,max]) await check(`RESULT-03 accepts ${level} boundary ${score}`,async()=>{
  const analysis={...base,riskLevel:level,riskScore:score};const h=await show(analysis);assert.equal(h.p.data.riskScore,score);assert.ok(h.p.data.riskInfo);
  assert.equal((await backend().call({patientId:1,duration:5,client_side_analysis:true,analysis_result:analysis})).status,200);
 });
 for(const score of [min-1,max+1]) await check(`RESULT-03 rejects ${level} outside ${score}`,async()=>{
  const analysis={...base,riskLevel:level,riskScore:score};assert.equal((await show(analysis)).p.data.riskInfo,null);
  assert.equal((await backend().call({patientId:1,duration:5,client_side_analysis:true,analysis_result:analysis})).status,400);
 });
}
for(const count of [0,1,7]) await check(`RESULT-02 description matches actual count ${count}`,async()=>{
 const h=await show({...base,duration:120,apneaEvents:count});assert.ok(h.p.data.riskInfo.desc.includes(` ${count} 次`));assert.equal(h.p.data.statCards[3].value,`${count} 次`);
});
for(const [level,label,color] of [['high','重度风险','#ef4444'],['medium','中度风险','#f59e0b']]) await check(`RESULT-04 exact label and color ${level}`,async()=>{
 const h=setup('index',{getAssessments:async()=>({data:[{id:'1',type:'ai_snore',snoreAnalysis:{...base,riskLevel:level}}]})});await h.p.onShow();assert.equal(h.p.data.records[0].levelLabel,label);assert.equal(h.p.data.records[0].levelColor,color);
});
await check('RESULT-01 list and detail preserve zero score, not treated as missing',async()=>{
 const row={id:1,user_id:10,patient_id:1,duration:5,avg_decibel:30,peak_decibel:30,snore_rate:0,apnea_events:0,risk_level:'normal',risk_score:0};
 assert.equal((await listResponse(row))[0].snoreAnalysis.riskScore,0);assert.equal((await savedDetail(row)).riskScore,0);
});
await check('RESULT-01 concurrent identical score retries keep one stored row',async()=>{
 const b=backend(),body={localId:'concurrent-score',patientId:1,duration:5,client_side_analysis:true,analysis_result:{...base,riskScore:55}};
 const responses=await Promise.all([b.call(body),b.call(body)]);assert.equal(b.writes.length,1);for(const r of responses){assert.equal(r.status,200);assert.equal(r.payload.data.snoreAnalysis.riskScore,55);}
});
for(const score of [undefined,null]) await check(`legacy score ${score} remains readable`,async()=>{const h=await show({...base,riskScore:score});assert.ok(h.p.data.riskInfo);assert.equal(h.p.data.loadError,'');});
console.log(JSON.stringify({scope:'independent regression; actual JS handlers/pages, mocked SQL/wx/session',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
