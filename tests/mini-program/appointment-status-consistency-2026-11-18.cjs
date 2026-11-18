const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const file=path.join(__dirname,'appointment-detail-actions-2026-11-18.cjs');
const output=process.env.APPOINTMENT_STATUS_OUTPUT || 'artifacts/appointment-status-consistency-2026-11-18';
const fixture={exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-detail-actions-2026-11-18',output)
  +'\nmodule.exports={detail,check,results};',{
  require:require('node:module').createRequire(file),__dirname,module:fixture,process,
  Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {detail,check,results}=fixture.exports;
let item;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../mp-weixin-rewrite/components/business/hj-appointment-item/index.js'),'utf8'),{
  Component:config=>{item=config;},
  require:()=>require('../../mp-weixin-rewrite/common/utils/appointment-time.js'),
});
(async()=>{
  for(const status of ['pending','confirmed','refunded','cancelled','pending_payment']){
    await check('list/detail actions: '+status,async observed=>{
      const s=await detail(status);
      const record={status,appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'};
      Object.assign(observed,{
        listActions:item.methods.computeShowActions(record,2),
        detailActions:s.page.data.showRescheduleCancelFooter||s.page.data.canPay,
        detailLabel:s.page.data.statusLabel,
      });
      const expected=['pending','confirmed','pending_payment'].includes(status);
      assert.deepEqual([observed.listActions,observed.detailActions],[expected,expected]);
      if(status==='refunded') assert.equal(observed.detailLabel,'已退款');
    });
  }
  await check('confirmed inside the cancellation cutoff hides list actions',async()=>{
    const now=new Date();
    const appointmentDate=[now.getFullYear(),now.getMonth()+1,now.getDate()].join('-');
    const appointmentTime=[now.getHours(),now.getMinutes()].join(':');
    assert.equal(item.methods.computeShowActions({status:'confirmed',appointmentDate,appointmentTime},2),false);
  });
  fs.writeFileSync(path.join(__dirname,output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  process.exitCode=results.some(r=>!r.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
