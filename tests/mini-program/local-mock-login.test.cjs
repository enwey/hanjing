const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let page,calls=0,modals=[],toasts=[],mode='local',canUse=true,release;
const env={get canUseLocalApi(){return canUse},getCurrentApiEnv:()=>mode,getApiEnvOptions:()=>[{key:mode}],getApiBaseUrl:()=>''};
const session={localLogin:()=>{calls++;return new Promise(r=>release=r)}};
vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/auth/login.js','utf8'),{Page:p=>page=p,require:p=>p.includes('session-store')?session:p.includes('config/env')?env:{report(){},reportNow:async()=>{},createTraceId:()=>''},wx:{showToast:o=>toasts.push(o),showLoading(){},hideLoading(){},showModal:o=>modals.push(o)},console,setTimeout,clearTimeout});
page.setData=d=>Object.assign(page.data,d);page.completeLogin=async()=>{};
(async()=>{
 await page.onLocalLogin();assert.equal(calls,0);assert.equal(toasts.length,1);
 page.data.agreed=true;mode='production';await page.onLocalLogin();assert.equal(calls,0);
 mode='local';canUse=false;await page.onLocalLogin();assert.equal(calls,0);
 canUse=true;const run=page.onLocalLogin();await page.onLocalLogin();assert.equal(calls,1);release();await run;
 let status=0,next=0,gate=false;
 const code=fs.readFileSync('hanjing-clinic-backend/helpers.js','utf8').split('export const authenticateWxToken = ')[1].split('// Hash password')[0];
 const h={jwt:{verify:(_,__,cb)=>cb(null,{id:1,openid:'local',authSource:'local-dev'})},JWT_SECRET:'test',canUseLocalDevLogin:()=>gate};vm.createContext(h);vm.runInContext('var auth = '+code,h);
 const res={status(n){status=n;return this},json(){return this}};h.auth({headers:{authorization:'Bearer test'}},res,()=>next++);assert.equal(status,401);assert.equal(next,0);gate=true;h.auth({headers:{authorization:'Bearer test'}},res,()=>next++);assert.equal(next,1);
 console.log('PASS page consent/platform/environment guards, double-submit lock, local-token protected API gate');
})().catch(e=>{console.error(e);process.exitCode=1});
