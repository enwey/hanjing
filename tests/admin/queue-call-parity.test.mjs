import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../../hanjing-clinic-管理后台源码-20260607/node_modules/typescript/lib/typescript.js';
const root='hanjing-clinic-管理后台源码-20260607/src/views/appointment/';
function load(page,fail=false) {
  const source=readFileSync(root+page+'.vue','utf8');
  const start=source.indexOf('const callPatient =');
  let code=source.slice(start,source.indexOf('\nconst checkInVisible',start));
  if(page==='workbench') {const a=source.indexOf('const triggerCallOnly =');code+='\n'+source.slice(a,source.indexOf("// Click '接诊'",a));}
  const events=[];const context={console:{error(){}},speakMandarin:text=>{events.push(['speak',text]);return true},MessagePlugin:{success:text=>events.push(['success',text]),warning:text=>events.push(['warning',text]),error:text=>events.push(['error',text])},request:{put:async(url,data)=>{events.push(['put',url,data.status]);if(fail)throw Error('failed')}},fetchAppointments:()=>events.push(['refresh'])};
  vm.createContext(context);vm.runInContext(ts.transpileModule(code+`;globalThis.call=callPatient;${page==='workbench'?'globalThis.trigger=triggerCallOnly;':''}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return {context,events};
}
for(const status of ['confirmed','waiting','called'])test(status+'叫号与工作台调用顺序及状态完全一致',async()=>{
  const item={id:'1',status,patientName:'测试患者',doctorName:'测试医生'};const q=load('queue'),w=load('workbench');await q.context.call(item,item.doctorName);await w.context.trigger(item);assert.deepEqual(q.events,w.events);assert.ok(q.events.some(e=>e[0]==='put'&&e[2]==='called'));
});
test('当前接诊患者与工作台一致：仅播报，不写预约状态',async()=>{const q=load('queue'),w=load('workbench');await q.context.call({id:'1',status:'checked_in',patientName:'测试患者'},'测试医生');w.context.call('测试患者','测试医生');assert.deepEqual(q.events,w.events);assert.ok(!q.events.some(e=>e[0]==='put'))});
test('失败提示与工作台一致',async()=>{const q=load('queue',true),w=load('workbench',true);const item={id:'1',status:'confirmed',patientName:'测试患者',doctorName:'测试医生'};await q.context.call(item,item.doctorName);await w.context.trigger(item);assert.deepEqual(q.events,w.events)});
