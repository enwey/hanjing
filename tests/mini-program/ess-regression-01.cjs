const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/assessment.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'\nmodule.exports={setup,gate};',box);
const {setup,gate}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
(async()=>{
await check('same person preserves answers; new person clears all answers and resets position',async()=>{
 const h=setup('questionnaire/index');await h.p.onShow();h.p.data.answers=Array(8).fill(2);h.p.data.currentQuestionIndex=7;
 h.p.onMemberChange({detail:{value:0}});assert.equal(h.p.data.answers[0],2);assert.equal(h.p.data.currentQuestionIndex,7);
 h.p.onMemberChange({detail:{value:1}});assert.ok(h.p.data.answers.every(n=>n===-1));assert.equal(h.p.data.currentQuestionIndex,0);
});
await check('failed load then retry restores questions and clears persistent error',async()=>{
 let fail=true;const h=setup('questionnaire/index',{getESSQuestions:async()=>{if(fail)throw Error('offline');return {data:Array.from({length:8},(_,i)=>({id:i+1}))};}});
 await h.p.onShow();assert.ok(h.p.data.loadError);assert.equal(h.p.data.isLoading,false);fail=false;await h.p.retryLoad();assert.equal(h.p.data.loadError,'');assert.equal(h.p.data.isPageReady,true);assert.equal(h.p.data.questions.length,8);
});
await check('repeated retry while loading sends only one questions request',async()=>{
 const d=gate();let n=0;const h=setup('questionnaire/index',{getESSQuestions:()=>{n++;return d.promise;}});
 const a=h.p.retryLoad();await h.p.retryLoad();assert.equal(n,1);d.resolve({data:Array.from({length:8},(_,i)=>({id:i+1}))});await a;assert.equal(h.p.data.isLoading,false);
});
await check('empty question response enters recoverable error state',async()=>{
 const h=setup('questionnaire/index',{getESSQuestions:async()=>({data:[]})});await h.p.onShow();assert.ok(h.p.data.loadError);assert.equal(h.p.data.isPageReady,false);assert.equal(h.p.data.isLoading,false);
});
await check('old navigation failure cannot unlock new session submission',async()=>{
 const h=setup('questionnaire/index');await h.p.onShow();h.p.data.answers=Array(8).fill(1);await h.p.submitQuestionnaire();const oldFail=h.calls[0].fail;
 h.setLogged(true);await h.p.onShow();const d=gate();h.api.submitESS=()=>d.promise;h.p.data.answers=Array(8).fill(2);const task=h.p.submitQuestionnaire();const toasts=h.toasts.length;oldFail();assert.equal(h.p.data.isSubmitting,true);assert.equal(h.toasts.length,toasts);d.resolve({data:{id:'new'}});await task;
});
await check('WXML tags balanced and retry button bound to handler',()=>{
 const t=fs.readFileSync(__dirname+'/../../mp-weixin-rewrite/pages/assessment/questionnaire/index.wxml','utf8'),stack=[];
 for(const tag of t.match(/<\/?[\w-]+(?:[^>"']|"[^"]*"|'[^']*')*>/g)||[]){const name=tag.match(/^<\/?([\w-]+)/)[1];if(tag.startsWith('</'))assert.equal(stack.pop(),name);else if(!tag.endsWith('/>'))stack.push(name);}assert.equal(stack.length,0);assert.match(t,/bindtap="retryLoad"/);assert.equal(typeof setup('questionnaire/index').p.retryLoad,'function');
});
console.log(JSON.stringify({scope:'independent regression with mocked wx/API/session; template inspection',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
