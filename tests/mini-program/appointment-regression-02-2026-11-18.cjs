// Re-execute original regression and isolation checks without overwriting earlier evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const out=path.join(__dirname,'artifacts/appointment-regression-02-2026-11-18');fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,'../../mp-weixin-rewrite');
const files=['pages/appointment/booking/index.js','pages/appointment/confirm.js','pages/appointment/confirm.wxml','pages/appointment/detail.js','stores/session-store.js','api/request.js','common/utils/subscribe.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
const evidence={phase:'second independent limited regression',startedAt:new Date().toISOString(),sourceBefore:hashes(),suites:[]};
async function run(file,from,to){
  const filename=path.join(__dirname,file),state={exitCode:0,env:process.env},logs=[];
  const print=(...args)=>logs.push(args.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' '));
  await vm.runInNewContext(fs.readFileSync(filename,'utf8').replaceAll(from,to),{
    require:createRequire(filename),__dirname,__filename:filename,module:{exports:{}},process:state,
    Buffer,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,console:{log:print,error:print,warn:print},
  },{filename});
  fs.writeFileSync(path.join(out,file+'.log'),logs.join('\n')+'\n');
  evidence.suites.push({file,exitCode:state.exitCode});console.log(`${state.exitCode?'FAIL':'PASS'} ${file}`);
}
(async()=>{
  await run('appointment-regression-2026-11-18.cjs','artifacts/appointment-regression-2026-11-18','artifacts/appointment-regression-02-2026-11-18/original');
  await run('appointment-patient-isolation-fix-2026-11-18.cjs','artifacts/appointment-patient-isolation-fix-2026-11-18','artifacts/appointment-regression-02-2026-11-18/isolation');
  const original=JSON.parse(fs.readFileSync(path.join(out,'original/results.json'),'utf8'));
  const isolation=JSON.parse(fs.readFileSync(path.join(out,'isolation/results.json'),'utf8'));
  evidence.originalFailures=original.boundaries.filter(r=>/^REG-APT-0[56] /.test(r.id));
  evidence.total=original.total+isolation.results.length;
  evidence.passed=original.passed+isolation.results.filter(r=>r.result==='passed').length;
  evidence.failed=original.failed+isolation.results.filter(r=>r.result==='failed').length;
  evidence.sourceAfter=hashes();evidence.sourceStable=JSON.stringify(evidence.sourceBefore)===JSON.stringify(evidence.sourceAfter);
  evidence.method='actual client pages, session and request modules; mocked WeChat/HTTP/storage/timing';evidence.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({total:evidence.total,passed:evidence.passed,failed:evidence.failed,sourceStable:evidence.sourceStable}));
  process.exitCode=evidence.failed||evidence.suites.some(s=>s.exitCode)||!evidence.sourceStable?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
