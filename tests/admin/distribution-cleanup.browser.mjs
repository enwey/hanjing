import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const {groups}=await import('../../hanjing-clinic-backend/temporary-runtime-cleanup/index.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=9372, base=process.env.ADMIN_TEST_URL || 'http://127.0.0.1:3000';
const profile=await mkdtemp(join(tmpdir(),'hanjing-distribution-ui-'));
const browser=spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws;
try {
  for(let i=0;i<300;i++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await sleep(200);}
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
  let id=0;const pending=new Map(),exceptions=[],calls=[],overviewRanges=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const me={id:1,name:'管理员',role_code:'super_admin',permissions:['database:view','database:sync','dashboard:view']};
  const plan={database:'隔离预览数据库',tableCount:1,planToken:'a'.repeat(64),unmanagedTables:[],changes:[{table:'users',action:'drop_column',name:'obsolete_field',before:'`obsolete_field` varchar(40) DEFAULT NULL'},{table:'users',action:'modify_column',name:'nickname',before:'`nickname` varchar(180) NOT NULL',after:'`nickname` varchar(100) NOT NULL'}]};
  ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);else if(m.method==='Fetch.requestPaused'){
    const {request,requestId}=m.params;const path=new URL(request.url).pathname;let data=[];
    if(path.endsWith('/me'))data=me;
    else if(path.endsWith('/database/schema'))data={database:plan.database,tables:[]};
    else if(path.endsWith('/database/temporary-cleanup'))data={groups};
    else if(path.endsWith('/dashboard/stats'))data={totalRevenue:100,totalAppointments:1,totalPatients:1,visitRate:'80%',periodLabel:'本月',trends:{appointments:{trend:'+100%',trendType:'up'},revenue:{trend:'+100%',trendType:'up'},patients:{trend:'0%',trendType:'neutral'},visitRate:{trend:'+33%',trendType:'up'}},departments:[],appointmentTrends:[],revenueTrends:[]};
    else if(path.endsWith('/dashboard/lists'))data={appointments:[],orders:[]};
    else if(path.endsWith('/distribution/overview')){overviewRanges.push(new URL(request.url).searchParams.get('range'));data={totalCommission:300,activePromoters:4,promotedOrders:0,invitedUsers:5,trends:{periodEnd:'2026-11-04',totalCommission:{current:300,previous:100,percent:200},activePromoters:{current:1,previous:2,percent:-50},promotedOrders:{current:0,previous:0,percent:0},invitedUsers:{current:5,previous:0,percent:100}}};}
    else if(path.endsWith('/distribution/leaderboard'))data=Array.from({length:7},(_,i)=>({id:i+1,nickname:'测试推广员'+(i+1),level:'silver',total_orders:0,invites:9,total_commission:0}));
    else if(path.endsWith('/distribution/commissions'))data=[];
    else if(path.endsWith('/database/temporary-cleanup/preview')){calls.push(JSON.parse(request.postData));data={database:'隔离测试库',token:'fixture',total:12,tables:[{table:'distributors',label:'推广员身份',count:4},{table:'distribution_relationships',label:'上下级绑定关系',count:5},{table:'promoter_accounts',label:'推广端登录账号',count:3}],updates:[{label:'解除推广员归属，保留订单和预约'}]};}
    else if(path.endsWith('/database/sync')){const body=JSON.parse(request.postData||'{}');calls.push(body);data=body.preview?plan:{...plan,success:true,backupDatabase:'hj_schema_backup_0123456789abcdef0123456789abcdef',syncedAt:new Date().toISOString()};}
    else if(request.method!=='GET'){exceptions.push('unexpected mutation '+path);}
    send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({code:200,data})).toString('base64')}).catch(e=>exceptions.push(e.message));
  }});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'}]});
  const auth='test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('auth_token',${JSON.stringify(auth)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(me))});`});
  for(const width of [1440,768]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:base+'/distribution'});
    for(let i=0;i<100;i++){await sleep(100);if(await evaluate("document.body.innerText.includes('测试推广员1')"))break;}
    assert.equal(await evaluate("document.querySelectorAll('tbody')[0]?.querySelectorAll('tr').length"),5);
    assert.ok(await evaluate("[...document.querySelectorAll('tbody')[0].querySelectorAll('tr')].every(r=>r.cells[3].innerText==='0')"));
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.stat-card-trend')].map(e=>e.innerText)"),['↑ +200%','↓ -50%','0%','↑ +100%']);
    assert.ok(await evaluate("[...document.querySelectorAll('.stat-card-trend')].every(e=>e.title.includes('本期') && e.title.includes('上期'))"));
    assert.equal(await evaluate("document.querySelectorAll('.panel-title svg').length"),0);
    assert.equal(await evaluate("document.body.innerText.includes('悬停可查看')"),false);
    for(const [range,label] of [['today','今日'],['week','本周'],['month','本月']]) {
      await evaluate(`[...document.querySelectorAll('.page-filter-actions button')].find(b=>b.innerText.trim()==='${label}').click()`);
      for(let i=0;i<100;i++){await sleep(50);if(await evaluate("document.querySelector('.stat-card-trend').innerText==='↑ +200%'"))break;}
      assert.ok(await evaluate(`[...document.querySelectorAll('.stat-card-label')].every(e=>e.innerText.startsWith('${label}'))`));
      assert.equal(await evaluate("localStorage.getItem('distribution_filter_time')"),range);
      assert.equal(overviewRanges.at(-1),range);
    }
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`hanjing-distribution-${width}.png`),Buffer.from(shot.data,'base64'));
    await send('Page.navigate',{url:base+'/database-tools'});
    for(let i=0;i<100;i++){await sleep(100);if(await evaluate("document.querySelectorAll('.cleanup-option').length===13"))break;}
    assert.equal(await evaluate("document.querySelectorAll('.cleanup-option').length"),13);
    await evaluate("[...document.querySelectorAll('.cleanup-option')].find(e=>e.innerText.includes('推广员账号与绑定关系')).click()");
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText==='预览清理范围').click()");await sleep(500);
    assert.ok(await evaluate("document.querySelector('.cleanup-confirm').innerText.includes('推广端登录账号')"));
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText==='立即清理').disabled"),true);
    const cleanupShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`hanjing-promoter-cleanup-${width}.png`),Buffer.from(cleanupShot.data,'base64'));
    console.log('PASS distribution top5/zero orders/real period trends and independent cleanup preview',width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/dashboard'});
  for(let i=0;i<100;i++){await sleep(100);if(await evaluate("document.querySelector('.stat-card-trend')?.innerText==='↑ +100%'"))break;}
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.stat-card-trend')].map(e=>e.innerText)"),['↑ +100%','↑ +100%','0%','↑ +33%']);
  const dashboardShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'hanjing-dashboard-growth.png'),Buffer.from(dashboardShot.data,'base64'));
  console.log('PASS dashboard growth percent display including visit rate');
  assert.deepEqual(calls,[{groups:['promoters']},{groups:['promoters']}]);
  assert.deepEqual(exceptions,[]);
}finally{ws?.close();browser.kill();await sleep(600);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
