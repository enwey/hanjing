const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const date='2026-11-20', output=process.env.APPOINTMENT_TIMEZONE_OUTPUT || 'artifacts/appointment-timezone-2026-11-18';
if(process.argv[2]==='--zone'){
  let now;
  class Clock extends Date {static now(){return now;}}
  const file=path.join(__dirname,'appointment-audit-2026-11-18.cjs');
  const fixture={exports:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8').split('\n(async()=>{')[0]
    .replaceAll('artifacts/appointment-audit-2026-11-18',output)
    .replace('Page: p =>','Date, Page: p =>')
    +'\nmodule.exports={create,loadPage};',{
    require:require('node:module').createRequire(file),__dirname,module:fixture,
    Date:Clock,Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
  });
  const {create,loadPage}=fixture.exports;
  let item;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../mp-weixin-rewrite/components/business/hj-appointment-item/index.js'),'utf8'),{
    Date:Clock,Component:config=>{item=config;},
    require:()=>require('../../mp-weixin-rewrite/common/utils/appointment-time.js'),
  });
  (async()=>{
    const record={id:'fixture',status:'pending',appointmentDate:date,appointmentTime:'09:00-09:30'};
    const results=[];
    for(const [name,minute,expected] of [['before',59,true],['exact',60,true],['after',61,false]]){
      const start=Date.parse(date+'T09:00:00+08:00');
      now=start-(180-minute)*60000;
      const s=loadPage('detail.js',create(),{
        getBookingSettings:async()=>({data:{cancelLimitHours:2}}),
        getAppointmentDetail:async()=>({data:{appointment:record,doctor:{},store:{}}}),
      });
      s.page.options={id:'fixture'};
      await s.page.loadPage();
      if(!s.page.data.appointmentLoaded) throw Error('详情加载失败');
      const list=item.methods.computeShowActions(record,2);
      const detail=s.page.data.showRescheduleCancelFooter;
      s.page.openReschedule();
      const listPage=loadPage('booking/index.js',create(),{});
      await listPage.page.cancelAppointment({detail:record});
      const detailCancel=s.page.cancelAppointment();
      if(s.modals.length) s.modals[0].success({confirm:false});
      await detailCancel;
      const guards=[s.nav.length>0,listPage.modals.length>0,s.modals.length>0];
      if(process.env.APPOINTMENT_LIST_CLICK_AUDIT === '1'){
        listPage.toasts.length=0;
        await listPage.page.handlePrimaryAction({detail:record});
        const listReschedule=listPage.nav.length>0;
        results.push({zone:process.env.TZ,name,expected,listReschedule,toasts:listPage.toasts,
          passed:listReschedule===expected && (expected || listPage.toasts.some(title=>title.includes('不支持改约')))});
        continue;
      }
      results.push({zone:process.env.TZ,name,now:new Date(now).toISOString(),expected,list,detail,guards,
        passed:[list,detail,...guards].every(value=>value===expected)});
    }
    console.log(JSON.stringify(results));
  })().catch(e=>{console.error(e);process.exitCode=1;});
}else{
  const results=['Asia/Shanghai','UTC','Asia/Tokyo'].flatMap(TZ=>{
    const child=spawnSync(process.execPath,[__filename,'--zone'],{encoding:'utf8',env:{...process.env,TZ}});
    if(child.status!==0) throw Error(child.stderr || '时区子进程失败');
    return JSON.parse(child.stdout);
  });
  fs.writeFileSync(path.join(__dirname,output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  process.exitCode=results.some(r=>!r.passed)?1:0;
}
