import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {preview} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=await preview({root,build:{outDir:process.env.UI_TEST_DIST || 'dist'},preview:{host:'127.0.0.1',port:4180,strictPort:false,open:false}});
let browser;
try {
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const user={id:1,name:'F4 test',username:'test',role:'super_admin',role_code:'super_admin',permissions:['*']};
  await context.addInitScript(user=>{localStorage.setItem('auth_token','TEST-ONLY');localStorage.setItem('user_info',JSON.stringify(user));},user);
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let status='cancelled', missingSummary=false, zeroSummary=false, failHistory=false;
  const historyRequests=[];
  const appointment={id:1,appointment_no:'F4-A1',patient_id:1,user_id:1,patient_name:'F4 Patient',patient_no:'F4-P',patient_gender:1,patient_age:40,
    store_id:1,store_name:'F4 Store',doctor_id:1,doctor_name:'F4 Doctor',appointment_date:'2099-10-16',appointment_time:'17:00',created_at:'2026-10-16 08:00:00',consult_fee:999999,type:'first'};
  await page.route('**/api/**',async r=>{
    const u=new URL(r.request().url()),p=u.pathname;
    if(r.request().method()==='OPTIONS'){await r.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'*','access-control-allow-headers':'*'}});return;}
    let data=[],code=200;
    if(p==='/api/admin/me')data=user;
    else if(p==='/api/admin/notifications/stats')data={};
    else if(p==='/api/admin/stores')data=[{id:1,name:'F4 Store'}];
    else if(p==='/api/admin/doctors')data=[{id:1,name:'Unrated Doctor',title:'Doctor',specialty:'Sleep',rating:null,review_count:0,positive_rate:null,store_names:['F4 Store'],status:1},{id:2,name:'Rated Doctor',title:'Doctor',specialty:'Sleep',rating:3.5,review_count:2,positive_rate:50,store_names:['F4 Store'],status:1}];
    else if(p==='/api/admin/appointments/1')data={...appointment,status,patient_summary:missingSummary?undefined:{visit_count:zeroSummary?0:120,receipts:zeroSummary?0:22500,refunds:zeroSummary?0:700,net_receipts:zeroSummary?0:21800}};
    else if(p==='/api/admin/appointments'){
      const current=Number(u.searchParams.get('page')||1),size=Number(u.searchParams.get('pageSize')||50);
      historyRequests.push({current,size});
      data={list:Array.from({length:Math.min(size,120-(current-1)*size)},(_,i)=>({...appointment,id:(current-1)*size+i+1,appointment_no:'HISTORY-'+((current-1)*size+i+1),status:'arrived'})),total:120};
      if(failHistory)code=503;
    }
    await r.fulfill({status:code,contentType:'application/json',body:JSON.stringify({code,data,message:code===200?'ok':'Test unavailable'})});
  });
  await page.goto(origin+'/doctor');
  await page.getByText('Unrated Doctor',{exact:true}).waitFor();
  assert.ok(await page.getByText('暂无评价',{exact:true}).count()>0);
  await page.getByText('3.5',{exact:true}).waitFor();
  assert.equal(await page.getByText('5',{exact:true}).count(),0);
  console.log('PASS: zero reviews are unknown, real average remains 3.5');
  await page.goto(origin+'/appointment/detail/1');
  await page.getByText('归属净收款 ¥218.00',{exact:true}).waitFor();
  assert.match(await page.locator('body').innerText(),/可见就诊 120次/);
  assert.doesNotMatch(await page.locator('.timeline').innerText(),/确认预约|已确认成功|结算完成/);
  console.log('PASS: cancelled appointment does not invent confirmation; summary uses actual API amounts');
  await page.getByRole('button',{name:'查看全部',exact:true}).click();
  const dialog=page.locator('.t-dialog:visible');
  await dialog.getByText('HISTORY-1',{exact:true}).waitFor();
  for(let current=2;current<=6;current++) {
    await dialog.locator('.t-pagination__btn-next').click();
    await dialog.getByText('HISTORY-'+((current-1)*10+1),{exact:true}).waitFor();
  }
  await dialog.getByText('HISTORY-51',{exact:true}).waitFor();
  assert.ok(historyRequests.some(r=>r.current===6&&r.size===10));
  console.log('PASS: history after row 50 is fetched from the server');
  failHistory=true;
  await dialog.locator('.t-pagination__btn-prev').click();
  await dialog.getByText('加载失败，请重新打开或切换页码重试',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('HISTORY-51',{exact:true}).count(),0);
  console.log('PASS: failed history page clears stale rows and shows failure');
  failHistory=false;status='completed';
  await page.goto(origin+'/appointment/detail/1');
  await page.getByText('归属净收款 ¥218.00',{exact:true}).waitFor();
  const timeline=page.locator('.timeline');
  assert.doesNotMatch(await timeline.innerText(),/17:00/);
  assert.match(await timeline.locator('.timeline-item').last().innerText(),/待完成/);
  console.log('PASS: completed treatment is not settled; no fabricated event time');
  missingSummary=true;
  await page.reload();await page.getByText('归属净收款 --',{exact:true}).waitFor();
  console.log('PASS: absent summary is unavailable rather than fabricated zero');
  missingSummary=false;zeroSummary=true;
  await page.reload();await page.getByText('归属净收款 ¥0.00',{exact:true}).waitFor();
  console.log('PASS: actual zero remains zero');
  const output=process.env.UI_TEST_ARTIFACT_DIR;
  if(output)await page.screenshot({path:path.join(output,'f4-detail-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  if(output)await page.screenshot({path:path.join(output,'f4-detail-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: no page runtime errors');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
