import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../../hanjing-clinic-管理后台源码-20260607/node_modules/typescript/lib/typescript.js';
const root='hanjing-clinic-管理后台源码-20260607/src/';
const ref=value=>({value});
function run(code,context,name) {
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code+`;globalThis.target=${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText,context);
  return context.target;
}
for(const page of ['index','detail','queue'])test(page+'诊疗完成只写completed并刷新，不弹收银',async()=>{
  const s=readFileSync(root+'views/appointment/'+page+'.vue','utf8');const a=s.indexOf('const completeTreatment =');const code=s.slice(a,s.indexOf('\n}',a)+2);
  const events=[];const row={id:'9',patient:'测试患者',patientName:'测试患者'};
  const context={console,appointment:ref(row),request:{put:async(url,body)=>events.push([url,body.status])},MessagePlugin:{success(){}},fetchAppointments:async()=>events.push('refresh'),fetchAppointmentDetail:async()=>events.push('refresh'),openCheckoutDialog:()=>{throw Error('must not open cashier')}};
  await run(code,context,'completeTreatment')(row);assert.deepEqual(events,[['/api/admin/appointments/9','completed'],'refresh']);
});
for(const page of ['index','detail','queue','workbench'])test(page+'已收款完成按钮仅关闭凭证，不请求预约接口',()=>{
  const s=readFileSync(root+'views/appointment/'+page+'.vue','utf8');const a=s.indexOf('function closePaidCheckout()');const code=s.slice(a,s.indexOf('\n}',a)+2);
  let invalidated=0;const attempt={orderId:'5'};
  const context={checkoutSuccess:ref(true),orderResult:ref({orderId:5}),checkoutLoading:ref(false),checkoutVisible:ref(true),checkoutFlow:{capture:()=>attempt,isCurrent:()=>true,invalidate:()=>invalidated++},selectedCheckoutRow:ref({id:9}),selectedQueueItem:ref({id:9}),nativePayInfo:ref(null),nativePayReceipt:ref(null),payWaiting:ref(false),request:new Proxy({}, {get(){throw Error('must not request appointment')}})};
  const close=run(code,context,'closePaidCheckout');close();assert.equal(context.checkoutVisible.value,false);assert.equal(invalidated,1);
  context.checkoutVisible.value=true;context.checkoutSuccess.value=false;close();assert.equal(context.checkoutVisible.value,true);
});
test('完成预约时间线以诊疗结束收尾，无待结算步骤',()=>{
  const source=readFileSync(root+'utils/appointmentTimeline.ts','utf8').replace('export function','function');const fn=run(source,{},'appointmentTimeline');
  for(const status of ['completed','arrived','settled']) {const stages=fn({status});assert.equal(stages.at(-1).title,'诊疗结束');assert.equal(stages.at(-1).dot,'green');assert.ok(!stages.some(s=>s.title.includes('结算')))}
});
