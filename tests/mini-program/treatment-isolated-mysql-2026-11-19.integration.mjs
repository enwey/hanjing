import assert from 'node:assert/strict';
import { load } from './treatment-page-harness.mjs';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';

const env = JSON.parse(execFileSync('docker', ['inspect','hanjing-mysql'], {encoding:'utf8'}))[0].Config.Env;
const password = env.find(line => line.startsWith('MYSQL_ROOT_PASSWORD='))?.slice('MYSQL_ROOT_PASSWORD='.length);
assert.ok(password);
const schema = 'hanjing_test_treatment_' + Date.now();
const control = await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const http = globalThis.fetch;
let created, db, server;
try {
  await control.query('CREATE DATABASE ' + schema);
  created = true;
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:schema,
    NODE_ENV:'test', JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex'),
    WX_MINI_APP_ID:'fixture-app',WX_MINI_APP_SECRET:'fixture-secret'});
  globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.hostname === 'api.weixin.qq.com') {
      if (u.pathname === '/sns/jscode2session') {
        const code=u.searchParams.get('js_code');
        return Response.json({openid:code==='fixture'?'fixture-booking-user':'fixture-booking-'+code});
      }
      if (u.pathname === '/cgi-bin/stable_token') return Response.json({access_token:'fixture-token',expires_in:7200});
      if (u.pathname === '/wxa/business/getuserphonenumber') {
        const code=JSON.parse(options.body).code;
        return Response.json({errcode:0,phone_info:{purePhoneNumber:code==='fixture-phone'?'13800009101':'138000092'+code.slice(-2)}});
      }
    }
    throw Error('Unexpected upstream call');
  };
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  const app = express();
  app.use(express.json());
  const client=await import('../../hanjing-clinic-backend/routes/client.js');
  app.use(client.default);
  app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
  // Match the production JSON error envelope without enabling its alerts.
  app.use((error,_req,res,_next)=>{
    const status=error.statusCode || error.status || 500;
    res.status(status).json({code:status,message:status>=500?'系统繁忙，请稍后再试':error.message || '请求失败'});
  });
  server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  async function call(path,body,token,method=body?'POST':'GET') {
    const r=await http('http://127.0.0.1:'+server.address().port+path,{method,
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const json=await r.json();
    return {status:r.status,...json};
  }
  async function ok(path,body,token) {
    const r=await call(path,body,token);assert.equal(r.status,200,r.message);return r.data;
  }
  const {access_token:token}=await ok('/api/v1/auth/wx-login',{code:'fixture',phoneCode:'fixture-phone'});
  await ok('/api/v1/user/family-members',{name:'Fixture child',relation:'child',gender:1,age:12},token);
  const familyPath='/api/v1/user/family-members';
  const family=await ok(familyPath,undefined,token);
  const members=Array.isArray(family)?family:family.list;
  const a=members.find(member=>member.relation==='self');
  const b=members.find(member=>member.relation==='child');
  assert.ok(a && b);
  console.log('MEMBERS',JSON.stringify({a:a.id,b:b.id}));
  const paths={
    getFamilyMembers:familyPath,getTreatmentRecord:'/api/v1/treatment/record',
    getTimeline:'/api/v1/treatment/timeline',getDeviceAdjustments:'/api/v1/treatment/adjustments',
    getWearingRecords:'/api/v1/treatment/wearing-records',getWearingSummary:'/api/v1/treatment/wearing-summary',
    getSleepReport:'/api/v1/treatment/sleep-report',submitWearingCheckin:'/api/v1/treatment/wearing',
  };
  const api=Object.fromEntries(Object.entries(paths).map(([name,path])=>[name,async params=>{
    const post=name==='submitWearingCheckin';
    const query=new URLSearchParams(params);
    const response=await call(post?path:path+'?'+query,post?params:undefined,token);
    if(response.status!==200 || response.code!==0) throw Error(response.message);
    return response.data;
  }]));
  const storage=new Map();
  const {page:home,store}=load('',api,true,storage,undefined,Date);
  const pages=Object.fromEntries(['calendar','sleep-trend','sleep-report','timeline','doctor-advice','adjust-detail']
    .map(name=>[name,load(name,api,true,storage,store,Date)]));
  delete pages['adjust-detail'].page._notificationPatientId;
  let failures=0, count=0;
  async function check(name,fn){
    count++;
    try { await fn(); console.log('PASS',name); }
    catch(error) { failures++; console.log('FAIL',name,error.message); }
  }
  const rows=()=>db.query("SELECT id, patient_id, patient_device_id, treatment_id, DATE_FORMAT(date,'%Y-%m-%d') AS day, wear_duration, pain_score, note, source FROM wearing_logs ORDER BY patient_id,date,id");
  await home.loadPage();
  await check('home default and empty treatment',()=>{
    assert.equal(home.selectedPatientId,String(a.id));
    assert.equal(home.data.heroBadgeText,'未开始');
  });
  const {page:calendar,calls:calendarCalls,toasts}=pages.calendar;
  for(const [member,hours,pain] of [[b,8,2],[a,4,6],[b,9,1]]){
    await check('calendar submit '+member.id+' '+hours,async()=>{
      await home.handleMemberChange({detail:{value:members.indexOf(member)}});
      await calendar.onShow();
      calendar.openCheckinModal();
      calendar.setData({selectedWearDuration:hours,selectedPainScore:pain,selectedComfort:4,checkinNote:'fixture-'+hours});
      await calendar.submitCheckin();
      assert.equal(toasts.at(-1)?.title,'打卡成功');
      assert.equal(calendarCalls.filter(x=>x.key==='submitWearingCheckin').at(-1).params.patientId,String(member.id));
      const current=await rows();
      console.log('ROWS',JSON.stringify(current));
      const owned=current.filter(row=>String(row.patient_id)===String(member.id));
      assert.equal(owned.length,1);
      assert.equal(Number(owned[0].wear_duration),hours);
      assert.equal(owned[0].pain_score,pain);
    });
  }
  const finalRows=await rows();
  const day=finalRows[0]?.day;
  for(const [member,hours,pain] of [[a,4,6],[b,9,1]]){
    await home.handleMemberChange({detail:{value:members.indexOf(member)}});
    for(const [name,{page,calls}] of Object.entries(pages)){
      await check(name+' for '+member.id,async()=>{
        const offset=calls.length;
        await page.onShow();
        assert.equal(page.data.loadError,'');
        assert.equal(page.data.hasLoaded,true);
        const relevant=calls.slice(offset).filter(x=>x.key!=='getFamilyMembers');
        assert.ok(relevant.length);
        assert.ok(relevant.every(x=>x.params.patientId===String(member.id)));
        if(name==='calendar'){
          assert.equal(page.data.dayCells.find(cell=>cell.id===day)?.wearDurationLabel,hours+'h');
          assert.equal(Number(page.data.monthStats.avgHours),hours);
        }
        if(name==='sleep-trend'){
          assert.equal(Number(page.data.chartItems.at(-1)?.durationLabel),hours);
          page.switchToMonth();
          assert.equal(Number(page.data.avgDurationLabel),hours);
        }
        if(name==='sleep-report'){
          page.setData({selectedRange:'week'});
          await page.loadReportData();
          const week=page.data.report;
          await page.selectDateRange({currentTarget:{dataset:{range:'month'}}});
          const month=page.data.report;
          console.log('REPORT',JSON.stringify({id:member.id,week:[week?.weekAvg,week?.avgPainScore,week?.score],month:[month?.weekAvg,month?.avgPainScore,month?.score]}));
          for(const report of [week,month]){
            assert.equal(report?.weekAvg,hours);
            assert.equal(report?.avgPainScore,pain);
          }
        }
      });
    }
  }
  await check('invalid duration leaves database unchanged',async()=>{
    const response=await call(paths.submitWearingCheckin,{patientId:b.id,date:day,wearDuration:25},token);
    assert.equal(response.status,400);
    assert.deepEqual(await rows(),finalRows);
  });
  await check('zero wear exposure across summary and report',async()=>{
    await api.submitWearingCheckin({patientId:b.id,date:day,wearDuration:0,painScore:0,comfort:5,note:'fixture-zero'});
    const [summary,report,actual]=await Promise.all([api.getWearingSummary({patientId:b.id}),api.getSleepReport({patientId:b.id,range:'week'}),rows()]);
    console.log('ZERO',JSON.stringify({summary,report:{hasData:report.hasData,compliance:report.compliance,score:report.score,streak:report.streak},rows:actual}));
    assert.equal(summary.weekWorn,0);
    assert.equal(report.compliance,0);
    assert.equal(report.streak,0);
    assert.equal(report.hasData,false);
    const month=await api.getSleepReport({patientId:b.id,range:'month'});
    assert.equal(month.compliance,0);
    assert.equal(month.streak,0);
    assert.equal(Number(actual.find(row=>String(row.patient_id)===String(b.id)).wear_duration),0);
  });
  await check('week trend excludes records older than seven days',async()=>{
    const dateDaysAgo=(days)=>{
      const date=new Date();
      date.setDate(date.getDate()-days);
      return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    };
    const firstDay=dateDaysAgo(6);
    const excludedDay=dateDaysAgo(7);
    for(const date of [firstDay,excludedDay]){
      await api.submitWearingCheckin({patientId:b.id,date,wearDuration:7,painScore:3,comfort:4,note:'fixture-window'});
    }
    const trend=pages['sleep-trend'].page;
    await trend.onShow();
    trend.switchToWeek();
    const labels=trend.data.chartItems.map(item=>item.dateLabel);
    console.log('WEEK_WINDOW',JSON.stringify({labels,rows:await rows()}));
    assert.deepEqual(Array.from(labels),[firstDay.slice(5),day.slice(5)]);
    const week=await api.getSleepReport({patientId:b.id,range:'week'});
    assert.equal(week.compliance,14);
    assert.equal(week.streak,0);
  });
  const offsetDay=(offset)=>{
    const date=new Date();
    date.setDate(date.getDate()+offset);
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  };
  await check('independent TRT-07 zero between positive days breaks streak',async()=>{
    for(const [offset,wearDuration] of [[-2,6],[-1,0],[0,8]]){
      await api.submitWearingCheckin({patientId:a.id,date:offsetDay(offset),wearDuration,painScore:0,comfort:5,note:'independent-zero'});
    }
    const actual=(await rows()).filter(row=>String(row.patient_id)===String(a.id));
    const week=await api.getSleepReport({patientId:a.id,range:'week'});
    const month=await api.getSleepReport({patientId:a.id,range:'month'});
    console.log('INDEPENDENT_ZERO',JSON.stringify({rows:actual,week:[week.compliance,week.streak,week.weekAvg],month:[month.compliance,month.streak,month.weekAvg]}));
    assert.deepEqual(actual.map(row=>[row.day,Number(row.wear_duration)]),[[-2,6],[-1,0],[0,8]].map(([offset,hours])=>[offsetDay(offset),hours]));
    assert.deepEqual([week.compliance,week.streak,week.weekAvg],[29,1,7]);
    assert.deepEqual([month.compliance,month.streak,month.weekAvg],[7,1,7]);
  });
  await check('independent TRT-08 exactly seven days from eight consecutive stored days',async()=>{
    for(let offset=-7;offset<=0;offset++){
      await api.submitWearingCheckin({patientId:b.id,date:offsetDay(offset),wearDuration:8+offset,painScore:0,comfort:5,note:'independent-window'});
    }
    const future=await call(paths.submitWearingCheckin,{patientId:b.id,date:offsetDay(1),wearDuration:9},token);
    const actual=(await rows()).filter(row=>String(row.patient_id)===String(b.id));
    const trend=pages['sleep-trend'].page;
    await trend.onShow();
    trend.switchToWeek();
    const points=Array.from(trend.data.chartItems, item=>[item.dateLabel,Number(item.durationLabel)]);
    const expected=Array.from({length:8},(_,i)=>[offsetDay(i-7),i+1]);
    console.log('INDEPENDENT_WINDOW',JSON.stringify({rows:actual,points,futureStatus:future.status}));
    assert.equal(future.status,400);
    assert.deepEqual(actual.map(row=>[row.day,Number(row.wear_duration)]),expected);
    assert.deepEqual(points,expected.slice(1).map(([date,hours])=>[date.slice(5),hours]));
  });
  await db.run("INSERT INTO roles(id,name,code) VALUES(9000,'Fixture admin','super_admin')");
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'fixture-treatment','unused','Fixture admin',9000)");
  await db.run("INSERT INTO doctors(id,name,title,specialty) VALUES(9001,'Doctor-A','Doctor','Fixture'),(9002,'Doctor-B','Doctor','Fixture')");
  await db.run("INSERT INTO stores(id,name,code,address) VALUES(9000,'Fixture clinic','TREAT','Fixture')");
  await db.run("INSERT INTO products(id,name,category,image_url,price,status) VALUES(9001,'Device-A','device','/fixture-a',100,'on'),(9002,'Device-B','device','/fixture-b',100,'on')");
  const admin=jwt.sign({id:9000,role:'super_admin',token_version:0},process.env.JWT_SECRET);
  const clinical=[];
  for(const [member,key,staff,value,hours] of [[a,'A',9001,0,5],[b,'B',9002,4,9]]){
    await check('bound fixture '+key,async()=>{
      const path='/api/admin/patients/'+member.id+'/treatment';
      const treatment=await ok(path,{doctor_id:staff,device_product_id:staff,initial_advancement:2,start_date:offsetDay(-3)},admin);
      assert.ok(treatment?.id);
      const med=await db.run("INSERT INTO medical_records(patient_id,doctor_id,store_id,visit_date,diagnosis,doctor_advice) VALUES(?,?,9000,?,?,?)",
        [member.id,staff,offsetDay(-3),'Diagnosis-'+key,'Advice-'+key]);
      const bound=await db.get('SELECT id FROM patient_devices WHERE bind_treatment_record_id=?',[treatment.id]);
      await db.run('UPDATE patient_devices SET bind_medical_record_id=? WHERE id=?',[med.id,bound.id]);
      const adjustment=await call(path+'/adjustments',{treatment_id:treatment.id,adjust_date:day,operator_id:staff,
        adjusted_advancement:value,instructions:'Adjustment-'+key,next_adjust_date:offsetDay(5)},admin);
      assert.equal(adjustment.status,200,adjustment.message);
      assert.equal(adjustment.code,200,adjustment.message);
      const proof=await db.get(`SELECT pd.id AS device_id,pd.patient_id,pd.bind_treatment_record_id AS treatment_id,pd.device_model,
        pd.current_advancement,tr.patient_device_id,mr.id AS medical_id,mr.diagnosis,mr.doctor_advice,
        da.id AS adjustment_id,da.adjusted_advancement,da.instructions
        FROM patient_devices pd JOIN treatment_records tr ON tr.id=pd.bind_treatment_record_id
        JOIN medical_records mr ON mr.id=pd.bind_medical_record_id JOIN device_adjustments da ON da.patient_device_id=pd.id
        WHERE pd.id=?`,[bound.id]);
      const timeline=await db.query('SELECT id,patient_id,treatment_id,event_type,event_desc FROM treatment_timelines WHERE treatment_id=? ORDER BY id',[treatment.id]);
      console.log('CLINICAL',JSON.stringify({key,proof,timeline}));
      assert.equal(proof.patient_device_id,bound.id);
      assert.equal(Number(proof.adjusted_advancement),value);
      assert.equal(timeline.length,2);
      clinical.push({member,key,staff,value,hours,proof,timeline});
    });
  }
  for(const fixture of [...clinical,...clinical.slice(0,1)]){
    const {member,key,value,hours,proof,timeline}=fixture;
    await home.handleMemberChange({detail:{value:members.indexOf(member)}});
    await check('bound home '+key,()=>{
      assert.equal(home.data.heroDeviceText,'Device-'+key);
      assert.equal(home.data.heroBadgeText,'治疗中');
      assert.ok(home.data.timelinePreview.some(item=>item.description.includes('Adjustment-'+key)));
    });
    await check('bound calendar write '+key,async()=>{
      await calendar.onShow();
      calendar.openCheckinModal();
      calendar.setData({selectedWearDuration:hours,selectedPainScore:2,selectedComfort:4,checkinNote:'Bound-'+key});
      await calendar.submitCheckin();
      const saved=(await rows()).find(row=>String(row.patient_id)===String(member.id)&&row.day===day);
      console.log('BOUND_WEAR',JSON.stringify(saved));
      assert.equal(saved.patient_device_id,proof.device_id);
      assert.equal(saved.treatment_id,proof.treatment_id);
      assert.equal(Number(saved.wear_duration),hours);
      assert.equal(calendar.data.dayCells.find(cell=>cell.id===day)?.wearDurationLabel,hours+'h');
    });
    await check('bound trend and report '+key,async()=>{
      const trend=pages['sleep-trend'].page;
      const report=pages['sleep-report'].page;
      await Promise.all([trend.onShow(),report.onShow()]);
      assert.ok(trend.data.currentPatientLabel.includes(member.name));
      assert.equal(Number(trend.data.chartItems.at(-1)?.durationLabel),hours);
      assert.ok(report.data.currentPatientLabel.includes(member.name));
      const logs=await api.getWearingRecords({patientId:member.id});
      assert.ok(logs.every(log=>String(log.patientId)===String(member.id)));
    });
    await check('bound advice '+key,async()=>{
      const page=pages['doctor-advice'].page;
      await page.onShow();
      assert.equal(page.data.adviceSections.find(item=>item.key==='diagnosis')?.content,'Diagnosis-'+key);
      assert.equal(page.data.adviceSections.find(item=>item.key==='advice')?.content,'Advice-'+key);
      assert.equal(page.data.followupDate,offsetDay(5));
    });
    await check('bound timeline '+key,async()=>{
      const page=pages.timeline.page;
      await page.onShow();
      assert.equal(page.data.deviceModel,'Device-'+key);
      assert.deepEqual(Array.from(page.data.timelineItems,item=>item.id).sort(),timeline.map(item=>String(item.id)).sort());
      assert.ok(page.data.timelineItems.some(item=>item.description.includes('Adjustment-'+key)));
    });
    await check('bound adjustment '+key,async()=>{
      const page=pages['adjust-detail'].page;
      await page.onShow();
      assert.equal(page.data.recordDetail.deviceModel,'Device-'+key);
      assert.equal(page.data.recordDetail.adjustmentValue,value);
      assert.equal(page.data.adjustmentHistory[0]?.id,String(proof.adjustment_id));
      assert.equal(page.data.adjustmentHistory[0]?.note,'Adjustment-'+key);
      console.log('ADJUST_VIEW',JSON.stringify({key,history:page.data.adjustmentHistory}));
      assert.equal(page.data.adjustmentHistory[0]?.value,value);
    });
  }
  if(clinical.length===2){
    for(const [name,request,read] of [
      ['doctor-advice','getTreatmentRecord',page=>page.data.adviceSections.find(item=>item.key==='advice')?.content],
      ['timeline','getTimeline',page=>page.data.timelineItems[0]?.description],
      ['adjust-detail','getDeviceAdjustments',page=>page.data.adjustmentHistory[0]?.note],
    ]){
      await check('late bound response '+name,async()=>{
        let parked,release;
        const ready=new Promise(resolve=>{parked=resolve;});
        const hold=new Promise(resolve=>{release=resolve;});
        const gated={...api,[request]:async params=>{
          const result=await api[request](params);
          if(parked && params.patientId===String(a.id)){parked();parked=null;await hold;}
          return result;
        }};
        await home.handleMemberChange({detail:{value:members.indexOf(a)}});
        const {page}=load(name,gated,true,storage,store,Date);
        delete page._notificationPatientId;
        const old=page.onShow();
        await Promise.race([ready,old.then(()=>{throw Error('未发出旧请求');})]);
        await home.handleMemberChange({detail:{value:members.indexOf(b)}});
        await page.onShow();
        const expected=read(page);
        release();
        await old;
        const actual=read(page);
        console.log('LATE',JSON.stringify({name,expected,actual}));
        assert.ok(expected?.includes('-B'));
        assert.equal(actual,expected);
      });
    }
  }
  if(clinical.length===2){
    const clinicalRows=async()=>({
      adjustments:await db.query('SELECT id,patient_device_id,treatment_id,adjusted_advancement FROM device_adjustments ORDER BY id'),
      timeline:await db.query('SELECT id,patient_id,treatment_id,event_desc FROM treatment_timelines ORDER BY id'),
      advice:await db.query('SELECT id,patient_id,doctor_advice FROM medical_records ORDER BY id'),
    });
    const before=await clinicalRows();
    await check('independent TRT-09 notification detail shows zero while B is selected',async()=>{
      await home.handleMemberChange({detail:{value:members.indexOf(b)}});
      const {page}=load('adjust-detail',api,true,storage,store,Date);
      page.onLoad({patientId:String(a.id)});
      await page.onShow();
      const row=before.adjustments.find(item=>item.id===clinical[0].proof.adjustment_id);
      console.log('INDEPENDENT_ZERO_ADJUST',JSON.stringify({row,selected:store.state.currentPatientId,history:Array.from(page.data.adjustmentHistory)}));
      assert.equal(Number(row.adjusted_advancement),0);
      assert.equal(store.state.currentPatientId,String(b.id));
      assert.equal(page.data.adjustmentHistory[0]?.id,String(row.id));
      assert.equal(page.data.adjustmentHistory[0]?.value,0);
    });
    for(const [name,request,read,expected] of [
      ['doctor-advice','getTreatmentRecord',page=>page.data.adviceSections.find(item=>item.key==='advice')?.content,'Advice-A'],
      ['timeline','getTimeline',page=>page.data.timelineItems[0]?.id,String(clinical[0].timeline[1].id)],
      ['adjust-detail','getDeviceAdjustments',page=>page.data.adjustmentHistory[0]?.id,String(clinical[0].proof.adjustment_id)],
    ]){
      await check('independent TRT-10 reverse switch and late failure '+name,async()=>{
        let ready,release;
        const parked=new Promise(resolve=>{ready=resolve;});
        const hold=new Promise(resolve=>{release=resolve;});
        const gated={...api,[request]:async params=>{
          const result=await api[request](params);
          if(params.patientId===String(b.id)){
            ready();
            await hold;
            throw Error('模拟旧治疗人请求超时');
          }
          return result;
        }};
        await home.handleMemberChange({detail:{value:members.indexOf(b)}});
        const {page,toasts}=load(name,gated,true,storage,store,Date);
        delete page._notificationPatientId;
        const old=page.onShow();
        try{
          await Promise.race([parked,old.then(()=>{throw Error('未发出旧请求');})]);
          await home.handleMemberChange({detail:{value:members.indexOf(a)}});
          assert.equal(store.state.currentPatientId,String(a.id));
          await page.onShow();
        } finally {
          release();
          await old;
        }
        console.log('INDEPENDENT_LATE',JSON.stringify({name,value:read(page),toasts,loadError:page.data.loadError}));
        assert.equal(read(page),expected);
        assert.equal(toasts.length,0);
        assert.equal(page.data.loadError,'');
        assert.deepEqual(await clinicalRows(),before);
      });
    }
  }
  if(clinical.length===2){
    const select=async member=>{
      await home.handleMemberChange({detail:{value:members.indexOf(member)}});
      assert.equal(store.state.currentPatientId,String(member.id));
    };
    const views=[
      ['calendar','getWearingRecords',page=>page.data.dayCells.find(cell=>cell.id===day)?.wearDurationLabel],
      ['sleep-trend','getWearingRecords',page=>page.data.chartItems.at(-1)?.durationLabel],
      ['sleep-report','getSleepReport',page=>page.data.report?.patientLabel],
      ['doctor-advice','getTreatmentRecord',page=>page.data.adviceSections.find(item=>item.key==='advice')?.content],
      ['timeline','getTimeline',page=>page.data.deviceModel],
      ['adjust-detail','getDeviceAdjustments',page=>page.data.adjustmentHistory[0]?.note],
    ];
    await check('independent TRT-13: open B form, switch to A with read failure, block write',async()=>{
      let fail=false;
      const gated={...api,getWearingSummary:async params=>{
        const result=await api.getWearingSummary(params);
        if(fail && params.patientId===String(a.id)) throw Error('模拟佩戴汇总失败');
        return result;
      }};
      await select(b);
      const {page,calls}=load('calendar',gated,true,storage,store,Date);
      await page.onShow();
      page.openCheckinModal();
      assert.equal(page.data.checkinNote,'Bound-B');
      assert.equal(page.data.checkinVisible,true);
      const before=await rows();
      await select(a);
      fail=true;
      await page.onShow();
      await page.submitCheckin();
      page.openCheckinModal();
      assert.equal(page.data.checkinVisible,false);
      assert.equal(calls.filter(call=>call.key==='submitWearingCheckin').length,0);
      const after=await rows();
      console.log('INDEPENDENT_FORM',JSON.stringify({today:after.filter(row=>row.day===day),error:page.data.loadError}));
      assert.deepEqual(after,before);
    });
    for(const [name,read,expected] of [
      ['calendar',page=>page.data.dayCells.find(cell=>cell.id===day)?.wearDurationLabel,'5h'],
      ['sleep-trend',page=>page.data.chartItems.at(-1)?.durationLabel,'5'],
    ]){
      await check('independent TRT-11 reverse delayed summary: '+name,async()=>{
        let signal,release;
        const ready=new Promise(resolve=>{signal=resolve;});
        const hold=new Promise(resolve=>{release=resolve;});
        const gated={...api,getWearingSummary:async params=>{
          const result=await api.getWearingSummary(params);
          if(params.patientId===String(b.id)){signal();await hold;}
          return result;
        }};
        await select(b);
        const {page}=load(name,gated,true,storage,store,Date);
        const old=page.onShow();
        try{
          await Promise.race([ready,old.then(()=>{throw Error('未发出旧请求');})]);
          await select(a);
          await page.onShow();
          assert.equal(read(page),expected);
        } finally {
          release();
          await old;
        }
        console.log('INDEPENDENT_REVERSE',JSON.stringify({name,selected:store.state.currentPatientId,value:read(page)}));
        assert.equal(read(page),expected);
      });
    }
    const stableRows=await rows();
    for(const [name,request,read] of views){
      await check('slow successful response after patient switch: '+name,async()=>{
        let signal,release,armed=true;
        const parked=new Promise(resolve=>{signal=resolve;});
        const hold=new Promise(resolve=>{release=resolve;});
        const gated={...api,[request]:async params=>{
          const response=await api[request](params);
          if(armed && params.patientId===String(a.id)){
            armed=false;
            signal();
            await hold;
          }
          return response;
        }};
        await select(a);
        const {page}=load(name,gated,true,storage,store,Date);
        delete page._notificationPatientId;
        const old=page.onShow();
        let expected;
        try{
          await Promise.race([parked,old.then(()=>{throw Error('未发出旧请求');})]);
          await select(b);
          await page.onShow();
          expected=read(page);
        } finally {
          release();
          await old;
        }
        const actual=read(page);
        console.log('SWITCH_SLOW',JSON.stringify({name,expected,actual,selected:store.state.currentPatientId}));
        assert.ok(expected);
        assert.equal(actual,expected);
        assert.deepEqual(await rows(),stableRows);
      });
    }
    let failedCalendar;
    for(const [name,request,read] of views){
      await check('new patient read fails after switch: '+name,async()=>{
        const gated={...api,[request]:async params=>{
          const response=await api[request](params);
          if(params.patientId===String(b.id)) throw Error('模拟新治疗人接口中断');
          return response;
        }};
        await select(a);
        const {page,toasts}=load(name,gated,true,storage,store,Date);
        delete page._notificationPatientId;
        await page.onShow();
        const previous=read(page);
        assert.ok(previous);
        await select(b);
        await page.onShow();
        if(name==='calendar') failedCalendar=page;
        const retained=read(page);
        console.log('SWITCH_FAILURE',JSON.stringify({name,previous,retained,selected:store.state.currentPatientId,toasts,loadError:page.data.loadError}));
        assert.ok(retained==null || retained==='','切换失败后仍呈现治疗人数据');
        assert.equal(page.data.hasLoaded,false);
        assert.equal(page.data.loadError,'模拟新治疗人接口中断');
        assert.deepEqual(await rows(),stableRows);
      });
    }
    await check('open checkin form cannot submit after changing patient',async()=>{
      await select(a);
      const {page,calls}=load('calendar',api,true,storage,store,Date);
      await page.onShow();
      page.openCheckinModal();
      assert.equal(page.data.checkinNote,'Bound-A');
      const before=await rows();
      await select(b);
      await page.submitCheckin();
      const after=await rows();
      console.log('STALE_FORM',JSON.stringify({selected:store.state.currentPatientId,before,after}));
      assert.equal(calls.filter(call=>call.key==='submitWearingCheckin').length,0);
      assert.deepEqual(after,before);
      await page.onShow();
      assert.equal(page.data.checkinVisible,false);
    });
    await check('calendar failure does not prefill and save another patient data',async()=>{
      assert.ok(failedCalendar);
      await select(b);
      const before=(await rows()).find(row=>String(row.patient_id)===String(b.id)&&row.day===day);
      failedCalendar.openCheckinModal();
      const form={duration:failedCalendar.data.selectedWearDuration,note:failedCalendar.data.checkinNote};
      await failedCalendar.submitCheckin();
      assert.equal(failedCalendar.data.checkinVisible,false);
      const after=(await rows()).find(row=>String(row.patient_id)===String(b.id)&&row.day===day);
      console.log('SWITCH_WRITE',JSON.stringify({form,before,after}));
      assert.deepEqual(after,before,'原治疗人表单覆盖了新治疗人的打卡记录');
      assert.notEqual(form.note,'Bound-A','新治疗人的打卡表单预填了旧治疗人的数据');
    });
  }
  console.log('RESULT',JSON.stringify({count,failures}));
  process.exitCode=failures?1:0;
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  try { await db?.closePool(); if(created) await control.query('DROP DATABASE '+schema); }
  finally { await control.end(); }
}
