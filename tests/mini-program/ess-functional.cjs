const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/assessment.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'\nmodule.exports={setup,gate};',box);
const {setup,gate}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
(async()=>{
await check('ESS-01 changing person must not silently submit previous persons answers',async()=>{
 let sent;const h=setup('questionnaire/index',{submitESS:async data=>{sent=data;return {data:{id:'x'}};}});
 await h.p.onShow();h.p.data.answers=Array(8).fill(3);h.p.data.currentQuestionIndex=7;
 h.p.onMemberChange({detail:{value:1}});await h.p.submitQuestionnaire();
 assert.equal(sent,undefined,'old eight answers silently submitted for patient '+sent?.patientId);
});
await check('ESS-02 old session rejection must not unlock current submission',async()=>{
 const old=gate(),fresh=gate();let calls=0;
 const h=setup('questionnaire/index',{submitESS:()=>++calls===1?old.promise:fresh.promise});
 await h.p.onShow();h.p.data.answers=Array(8).fill(1);const a=h.p.submitQuestionnaire();
 h.setLogged(true);await h.p.onShow();h.p.data.answers=Array(8).fill(2);const b=h.p.submitQuestionnaire();
 old.reject(Error('old request failed'));await a;const locked=h.p.data.isSubmitting;
 fresh.resolve({data:{id:'fresh'}});await b;assert.equal(locked,true,'old error unlocked new in-flight submission');
});
await check('ESS-03 questionnaire initial failure exposes persistent retry or error state',async()=>{
 const h=setup('questionnaire/index',{getESSQuestions:async()=>{throw Error('offline');}});await h.p.onShow();
 const template=fs.readFileSync(__dirname+'/../../mp-weixin-rewrite/pages/assessment/questionnaire/index.wxml','utf8');
 assert.ok(/重试|加载失败|loadError/.test(template),'only temporary toast; no error/retry branch in template, questions='+h.p.data.questions.length);
});
await check('eight answers including zero progress and submit correct member',async()=>{
 let sent;const h=setup('questionnaire/index',{submitESS:async d=>{sent=d;return {data:{id:'ok'}};}});h.p.onLoad({patientId:'2'});await h.p.onShow();
 for(let i=0;i<8;i++){h.p.selectAnswer({currentTarget:{dataset:{score:i%4}}});if(i<7)h.p.nextQuestion();}
 await h.p.submitQuestionnaire();assert.equal(sent.patientId,'2');assert.equal(sent.answers.reduce((a,b)=>a+b,0),12);assert.equal(h.calls.length,1);
});
await check('cannot skip unanswered intermediate question using dots',async()=>{
 const h=setup('questionnaire/index');await h.p.onShow();h.p.selectAnswer({currentTarget:{dataset:{score:0}}});h.p.handleDotClick({currentTarget:{dataset:{index:7}}});assert.equal(h.p.data.currentQuestionIndex,0);
});
await check('pending submit freezes answer edits and member changes',async()=>{
 const d=gate(),h=setup('questionnaire/index',{submitESS:()=>d.promise});await h.p.onShow();h.p.data.answers=Array(8).fill(1);const task=h.p.submitQuestionnaire();
 h.p.selectAnswer({currentTarget:{dataset:{score:3}}});h.p.onMemberChange({detail:{value:1}});assert.equal(h.p.data.answers[0],1);assert.equal(h.p.data.selectedMemberId,'1');d.resolve({data:{id:'ok'}});await task;
});
await check('result presents eight answer labels',async()=>{
 const h=setup('result/index',{getAssessmentDetail:async()=>({data:{id:'x',type:'ess',essScore:12,essAnswers:[0,1,2,3,0,1,2,3]}})});h.p.onLoad({id:'x'});await h.p.onShow();assert.equal(h.p.data.answerReviewList.length,8);assert.equal(h.p.data.answerReviewList[0].label,'从不');assert.equal(h.p.data.answerReviewList[3].label,'高度');
});
console.log(JSON.stringify({scope:'actual ESS page modules with mocked wx/API/session; template inspection',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
