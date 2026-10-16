import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/utils/appointmentTimeline.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {appointmentTimeline}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('cancelled, missed and refunded appointments never invent confirmation or settlement',()=>{
  for(const status of ['cancelled','no_show','refunding','refunded']) {
    const steps=appointmentTimeline({status,createTime:'2026-10-16 08:00'});
    assert.equal(steps.length,2);assert.equal(steps[0].time,'2026-10-16 08:00');
    assert.equal(steps.some(s=>['确认预约','结算完成'].includes(s.title)),false);
  }
});
test('pending and unknown states do not invent clinical progress',()=>{
  assert.deepEqual(appointmentTimeline({status:'pending_payment'}).map(s=>s.title),['创建预约','等待支付']);
  assert.equal(appointmentTimeline({status:'unknown'}).at(-1).title,'状态待核实');
  assert.ok(appointmentTimeline({status:'pending'}).slice(2).every(s=>s.dot==='gray'));
});
test('completed is not settled and scheduled time is never used as an event timestamp',()=>{
  for(const status of ['confirmed','called','checked_in','completed','arrived','settled']) {
    const steps=appointmentTimeline({status,dateTime:'2026-10-16 17:00',createTime:'2026-10-15 10:00'});
    assert.ok(steps.slice(1).every(s=>['时间未记录','待完成'].includes(s.time)));
    assert.equal(steps.at(-1).dot,['arrived','settled'].includes(status)?'green':'gray');
  }
});
