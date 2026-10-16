import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Reuse the same isolated API fixtures as the normal cashier regression.
const fixtureUrl = new URL('./appointment-cashier-ui.mjs', import.meta.url);
const require = createRequire(fixtureUrl);
let source = fs.readFileSync(fixtureUrl, 'utf8').replace(/\r\n/g, '\n');
source = source.replaceAll('list:[appointment]', 'list:[appointment,{...appointment,id:2,patient_name:"SECOND-PATIENT"}]');
source = source.replace('list:[patient],pagination:', 'list:[patient,{...patient,id:2,name:"SECOND-PATIENT"}],pagination:');
const start = source.indexOf("  await page.goto(origin+'/appointment/create");
const end = source.indexOf('} catch(error){');
if (start < 0 || end < start) throw new Error('Cashier fixture boundary changed');
const cases = String.raw`
  const failures=[];
  const check=(name,ok)=>{console.log((ok?'PASS: ':'FAIL: ')+name);if(!ok)failures.push(name);};
  let releaseStatus, receivedStatus;
  const gate=new Promise(r=>releaseStatus=r), received=new Promise(r=>receivedStatus=r);
  let firstOrder, staleResponses=0, secondPaid=false;
  await page.route('**/api/admin/pay/native',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{paid:false}})}));
  await page.route('**/api/admin/pay/orders/*/status',async r=>{
    const id=Number(new URL(r.request().url()).pathname.split('/').at(-2));
    if(!firstOrder)firstOrder=id;
    if(id===firstOrder){staleResponses++;receivedStatus();await gate;}
    await r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{orderId:id,status:id===firstOrder||secondPaid?'paid':'pending',payAt:today+' 09:01:00',payMethod:'wechat_native'}})});
  });
  await page.route(/\/api\/admin\/appointments\/2(?:\?.*)?$/,async r=>{
    if(r.request().method()==='PUT')stateWrites.push({target:2,...r.request().postDataJSON()});
    await r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{...appointment,id:2,patient_name:'SECOND-PATIENT'}})});
  });
  await page.goto(origin+'/appointment?checkout_id=1');
  await expectFees();await submit().click();await received;
  await page.waitForTimeout(2300);
  check('R02 pending polling never overlaps',staleResponses===1);
  await currentDialog().getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('tr').filter({hasText:'SECOND-PATIENT'}).getByRole('button',{name:'挂号收银',exact:true}).click();
  await expectFees();await submit().click();releaseStatus();
  await page.waitForTimeout(600);
  check('R02 old payment cannot replace the next checkout receipt',await page.getByRole('button',{name:'完成结算',exact:true}).count()===0);
  secondPaid=true;
  await page.getByRole('button',{name:'完成结算',exact:true}).waitFor();
  const text=await page.locator('.t-dialog:visible').innerText();
  const lastOrder=orders.get(writes.at(-1).request_id);
  check('R02 old completion does not stop the next polling session',text.includes('ORDER-'+lastOrder)&&lastOrder!==firstOrder);

  await page.unroute('**/api/admin/pay/orders/*/status');
  stateWrites.length=0;appointment.status='checked_in';
  await page.goto(origin+'/appointment');
  await page.getByRole('button',{name:'诊疗完成',exact:true}).first().click();
  await currentDialog().waitFor();
  await currentDialog().getByRole('button',{name:'添加诊疗费/项目/药品'}).click();
  await currentDialog().locator('label').filter({hasText:'现金已收款'}).click();await submit().click();
  await page.getByRole('button',{name:'完成结算',exact:true}).waitFor();
  await page.getByRole('button',{name:'完成结算',exact:true}).click();
  await page.waitForTimeout(400);
  check('R03 treatment completion settles using current server state',appointment.status==='arrived' && stateWrites.some(row=>row.status==='arrived'));

  for(const [url,label] of [['/appointment/detail/1','挂号收银'],['/queue','收银'],['/workbench','划扣收费']]) {
    appointment.status=url.includes('/detail/')?'pending_payment':'checked_in';
    let release, arrived;
    const gate=new Promise(r=>release=r), received=new Promise(r=>arrived=r);
    await page.route('**/api/admin/pay/orders/*/status',async r=>{
      arrived();await gate;
      await r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{status:'paid',payAt:today+' 09:01:00'}})});
    });
    await page.goto(origin+url);
    await page.getByRole('button',{name:label,exact:true}).first().click();
    await currentDialog().waitFor();
    if(appointment.status==='checked_in')await currentDialog().getByRole('button',{name:'添加诊疗费/项目/药品'}).click();
    await submit().click();
    await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(new Error('poll not started: '+url)),10000))]);
    await currentDialog().getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:label,exact:true}).first().click();await currentDialog().waitFor();
    release();await page.waitForTimeout(400);
    check('R02 close/reopen drops old payment at '+url,await page.getByRole('button',{name:'完成结算',exact:true}).count()===0);
    await page.unroute('**/api/admin/pay/orders/*/status');
  }

  appointment.status='pending_payment';
  let releaseCreate, createPolled;
  const createGate=new Promise(r=>releaseCreate=r), createReceived=new Promise(r=>createPolled=r);
  await page.route('**/api/admin/pay/orders/*/status',async r=>{
    createPolled();await createGate;
    await r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{status:'paid',payAt:today+' 09:01:00'}})});
  });
  await page.goto(origin+'/appointment/create?patient_id=1&store_id=1&doctor_id=1');
  await page.locator('.slot-item').first().waitFor();await page.getByRole('button',{name:'确认创建',exact:true}).click();
  await expectFees();await submit().click();await createReceived;
  await page.getByRole('button',{name:'关闭并查看原订单',exact:true}).click();await page.waitForURL(/\/order\/detail\//);
  releaseCreate();await page.waitForTimeout(400);
  check('R02 leaving create page drops in-flight payment notification',await page.getByText('收款成功',{exact:true}).count()===0);
  await page.unroute('**/api/admin/pay/orders/*/status');

  let releaseStandalone, standalonePolled;
  const standaloneGate=new Promise(r=>releaseStandalone=r), standaloneReceived=new Promise(r=>standalonePolled=r);
  await page.route('**/api/admin/pay/orders/*/status',async r=>{
    standalonePolled();await standaloneGate;
    await r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{status:'paid',payAt:today+' 09:01:00'}})});
  });
  await page.goto(origin+'/appointment/checkout?patientId=1');
  await page.getByRole('button',{name:/确认收费结算/}).click();await standaloneReceived;
  await page.getByPlaceholder('输入患者姓名或手机号搜索').click();
  await page.getByText('SECOND-PATIENT (13800138000)',{exact:true}).click();
  releaseStandalone();await page.waitForTimeout(400);
  check('R02 standalone cashier patient switch drops old payment',await page.locator('.success-panel').count()===0);
  await page.unroute('**/api/admin/pay/orders/*/status');

  appointment.status='pending_payment';
  await page.goto(origin+'/appointment/detail/1');
  await page.getByRole('button',{name:'挂号收银',exact:true}).waitFor();
  let releaseDetail, detailRequested;
  const detailGate=new Promise(r=>releaseDetail=r), detailReceived=new Promise(r=>detailRequested=r);
  await page.route(/\/api\/admin\/appointments\/2(?:\?.*)?$/,async r=>{
    detailRequested();await detailGate;
    await r.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{...appointment,id:2,patient_name:'SECOND-PATIENT'}})});
  });
  await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/appointment/detail/2'));
  await detailReceived;
  await page.getByRole('button',{name:'挂号收银',exact:true}).click();
  check('R02 detail route change cannot bill the previous patient while loading',await currentDialog().count()===0);
  releaseDetail();await page.getByText('SECOND-PATIENT',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'挂号收银',exact:true}).click();await expectFees();
  check('R02 current detail can open cashier once the correct patient has loaded',await currentDialog().count()===1);
  check('no page runtime errors',errors.length===0);
  assert.deepEqual(failures,[]);
`;
source = source.slice(0,start) + cases + source.slice(end);
source = source.replaceAll('import.meta.url',JSON.stringify(fixtureUrl.href));
source = source.replace(/from (['"])([^'"]+)\1/g,(_,quote,spec)=>'from '+quote+(spec.startsWith('node:')?spec:pathToFileURL(require.resolve(spec)).href)+quote);
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
