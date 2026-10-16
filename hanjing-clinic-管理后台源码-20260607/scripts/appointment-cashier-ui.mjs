import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await preview({ root, build: { outDir: process.env.UI_TEST_DIST || 'dist' }, preview: { host:'127.0.0.1',port:4179,strictPort:false,open:false } });
let browser, page;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({headless:true,channel:'msedge'});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const user={id:1,name:'Cashier test',username:'test',role_code:'super_admin',role:'super_admin',permissions:['*']};
  await context.addInitScript(user=>{localStorage.setItem('auth_token','TEST-ONLY');localStorage.setItem('user_info',JSON.stringify(user));},user);
  page=await context.newPage();
  page.setDefaultTimeout(15000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  const patient={id:1,name:'收银测试患者',phone:'13800138000',gender:1,age:40,patient_no:'P1',appointments:[]};
  const appointment={id:1,appointment_no:'BK-TEST',patient_id:1,user_id:1,patient_name:patient.name,patient_phone:patient.phone,
    patient_gender:1,patient_age:40,patient_no:'P1',store_id:1,store_name:'测试门店',doctor_id:1,doctor_name:'测试医生',
    appointment_date:today,appointment_time:'09:00-09:30',status:'pending_payment',type:'first',consult_fee:5000,deposit_amount:2000,created_at:today+' 08:00:00'};
  const products=[{id:901,name:'挂号门诊费',price:5000,category:'service',status:'on'},{id:902,name:'预约定金',price:2000,category:'service',status:'on'}];
  const writes=[], stateWrites=[], orders=new Map();
  let nativeFail=true, nativeCalls=0;
  await page.route('**/api/**',async route=>{
    const req=route.request(), url=new URL(req.url()), p=url.pathname, method=req.method();
    let data=[], status=200, message='ok';
    if(method==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'*'}});return;}
    if(p==='/api/admin/me')data=user;
    else if(p==='/api/admin/settings')data={require_deposit:true,deposit_amount:2000,booking_interval:30};
    else if(p==='/api/admin/stores'||p==='/api/admin/orders/cashier-stores')data=[{id:1,name:'测试门店'}];
    else if(p==='/api/admin/doctors')data=[{id:1,name:'测试医生',title:'医师',specialty:'睡眠',store_ids:[1],consult_fee:5000}];
    else if(p==='/api/admin/patients/1')data=patient;
    else if(p==='/api/admin/patients')data={list:[patient],pagination:{total:1,page:1,pageSize:20}};
    else if(p==='/api/admin/products')data=products;
    else if(p==='/api/admin/day-slots')data=[{time:'09:00-09:30',status:'available',period:'am',booked:0,total:10,schedule_id:1}];
    else if(p==='/api/admin/schedules')data=[{id:1,date:today,doctor_id:1,doctor_name:'测试医生',store_id:1,store_name:'测试门店',start_time:'09:00',end_time:'12:00'}];
    else if(p==='/api/admin/appointments'){
      if(method==='POST')data={id:1,appointment_no:'BK-TEST'};
      else data=url.searchParams.has('page')?{list:[appointment],total:1,counts:{all:1,today:1,pending_payment:1}}:[appointment];
    } else if(p==='/api/admin/appointments/1'){
      if(method==='PUT'){stateWrites.push(req.postDataJSON());Object.assign(appointment,req.postDataJSON());}
      data=appointment;
    } else if(p==='/api/admin/orders' && method==='POST'){
      const payload=req.postDataJSON();writes.push(payload);
      if(!orders.has(payload.request_id))orders.set(payload.request_id,orders.size+1);
      const id=orders.get(payload.request_id), paid=payload.pay_method==='cash';
      data={order_id:id,order_no:'ORDER-'+id,receipt:{orderId:id,orderNo:'ORDER-'+id,patientName:patient.name,
        totalAmount:7000,discountAmount:0,payAmount:7000,payMethod:payload.pay_method,payAt:paid?today+' 09:01:00':null,status:paid?'paid':'pending',
        items:payload.items.map(i=>({productId:i.product_id,productName:i.product_name,price:i.price,quantity:i.quantity}))}};
    } else if(p==='/api/admin/pay/native'){
      nativeCalls++;
      if(nativeFail){status=503;message='Test channel unavailable';}
      else data={paid:true};
    } else if (/^\/api\/admin\/pay\/orders\/\d+\/status$/.test(p)) {
      data={status:'paid',payAt:today+'T01:01:00.000Z',payMethod:'wechat_native'};
    } else if(p==='/api/admin/notifications/stats')data={};
    await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify({code:status,message,data})});
  });
  const currentDialog=()=>page.locator('.t-dialog:visible').filter({has:page.getByText('支付方式',{exact:true})});
  const submit=()=>page.getByRole('button',{name:/确认支付收款/});
  async function expectFees(){
    const dialog=currentDialog();
    await dialog.getByText('预约定金',{exact:true}).first().waitFor({state:'attached'});
    assert.ok((await dialog.innerText()).includes('70.00'));
    return dialog;
  }
  await page.goto(origin+'/appointment/create?patient_id=1&store_id=1&doctor_id=1');
  await page.getByText(patient.name,{exact:true}).first().waitFor();
  await page.locator('.slot-item').first().waitFor();
  await page.getByRole('button',{name:'确认创建',exact:true}).click();
  let dialog=await expectFees();
  assert.equal(await dialog.locator('input[value="wechat"]').count(),0);
  assert.equal(await dialog.locator('input[value="wechat_native"]').isChecked(),true);
  await submit().click();
  await page.getByText('Test channel unavailable',{exact:true}).first().waitFor();
  const originalId=writes.at(-1).request_id;
  assert.equal(writes.at(-1).appointment_id,1);
  assert.deepEqual(writes.at(-1).items.map(i=>i.appointment_fee_kind),['consult_fee','deposit_amount']);
  nativeFail=false;
  await submit().click();
  await page.getByRole('button',{name:'完成结算',exact:true}).waitFor();
  await page.getByText(today+' 09:01:00',{exact:true}).waitFor();
  assert.equal(writes.at(-1).request_id,originalId);assert.equal(orders.size,1);assert.equal(nativeCalls,2);
  await page.screenshot({path:path.join(os.tmpdir(),'hanjing-cashier-created-paid.png'),fullPage:false});
  await page.getByRole('button',{name:'完成结算',exact:true}).click();
  await page.waitForURL(origin+'/appointment');
  assert.equal(stateWrites.at(-1).status,'pending');
  console.log('PASS: create appointment -> full fees -> channel failure -> same order retry -> settle');

  for(const url of ['/appointment?checkout_id=1','/appointment/detail/1']){
    appointment.status='pending_payment';
    await page.goto(origin+url);
    if(url.includes('/detail/'))await page.getByRole('button',{name:'挂号收银',exact:true}).click();
    dialog=await expectFees();
    await dialog.locator('label').filter({hasText:'现金已收款'}).click();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/orders'&&r.request().method()==='POST');
    await submit().click();await response;
    await page.getByRole('button',{name:'完成结算',exact:true}).waitFor();
    const body=writes.at(-1);
    assert.equal(body.payment_confirmed,true);assert.equal(body.appointment_id,1);assert.equal(body.pay_amount,7000);
    assert.deepEqual(body.items.map(i=>i.appointment_fee_kind),['consult_fee','deposit_amount']);
    assert.equal(body.shipping_address.province,undefined);assert.equal(body.shipping_address.city,undefined);
    console.log('PASS: cashier payload and fee coverage '+url);
  }
  for(const [url,label] of [['/queue','收银'],['/workbench','划扣收费']]){
    appointment.status='checked_in';
    await page.goto(origin+url);
    await page.getByRole('button',{name:label,exact:true}).first().click();
    dialog=currentDialog();await dialog.waitFor();
    assert.equal(await dialog.getByText('预约定金',{exact:true}).count(),0);
    console.log('PASS: '+url+' does not bill appointment fees twice');
  }
  await page.goto(origin+'/appointment/checkout?patientId=1');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value.includes('收银测试患者')));
  assert.ok(await page.locator('input').evaluateAll(nodes=>nodes.some(input=>input.value==='微信收款码')));
  console.log('PASS: standalone cashier accepts paginated patient results');

  // Closing the cashier preserves both records and exposes recovery on the original order.
  appointment.status='pending_payment'; nativeFail=true;
  await page.goto(origin+'/appointment/create?patient_id=1&store_id=1&doctor_id=1');
  await page.locator('.slot-item').first().waitFor();
  await page.getByRole('button',{name:'确认创建',exact:true}).click();
  await expectFees(); await submit().click();
  await page.getByText('Test channel unavailable',{exact:true}).first().waitFor();
  const preservedId=orders.get(writes.at(-1).request_id), stateCount=stateWrites.length, orderCount=writes.length;
  let detail={id:preservedId,order_no:'ORDER-'+preservedId,status:'pending',pay_method:'wechat_native',pay_amount:7000,total_amount:7000,discount_amount:0,
    type:'offline',created_at:today+' 08:00:00',items:[],commissions:[],shipping_address:{},user_name:'测试患者'};
  let cancelFails=true; const registrations=[], recoveredIds=[];
  const fulfill=(r,data,status=200,message='ok')=>r.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status,data,message})});
  await page.route('**/api/admin/orders/**',async r=>{
    const p=new URL(r.request().url()).pathname;
    if(p===`/api/admin/orders/${preservedId}`)return fulfill(r,detail);
    if(p===`/api/admin/orders/${preservedId}/offline-refund`){
      const payload=r.request().postDataJSON();registrations.push(payload);
      detail={...detail,status:'refunded',refund_at:payload.refunded_at,shipping_address:{offline_refund:{...payload,actor_id:1,registered_at:new Date().toISOString()}}};
      return fulfill(r,{status:'refunded'},200,'实际退款已登记');
    }
    if(p===`/api/admin/orders/${preservedId}/refund`){
      detail={...detail,status:'refunding',wechat_refund_no:'HJR-TEST'};
      return fulfill(r,null,502,'渠道响应超时，请同步退款结果');
    }
    if(p===`/api/admin/orders/${preservedId}/refund-sync`){
      detail={...detail,status:'refunded',wechat_refund_id:'WX-REFUND-TEST',refund_at:new Date().toISOString()};
      return fulfill(r,{status:'refunded'},200,'退款已确认');
    }
    return r.fallback();
  });
  await page.route('**/api/admin/pay/**',async r=>{
    const p=new URL(r.request().url()).pathname;
    if(p==='/api/admin/pay/native'){recoveredIds.push(r.request().postDataJSON().orderId);return fulfill(r,{paid:false,qrCodeImageUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'});}
    if(p.endsWith('/status'))return fulfill(r,{status:detail.status});
    if(p.endsWith('/cancel')){
      if(cancelFails)return fulfill(r,null,409,'渠道尚未确认关闭');
      detail.status='cancelled';return fulfill(r,{});
    }
    return r.fallback();
  });
  await page.getByRole('button',{name:'关闭并查看原订单',exact:true}).click();
  await page.waitForURL(origin+`/order/detail/${preservedId}`);
  assert.equal(stateWrites.length,stateCount);assert.equal(appointment.status,'pending_payment');
  await page.getByRole('button',{name:'处理原付款单',exact:true}).click();
  await page.getByRole('button',{name:'获取原单二维码',exact:true}).click();
  await page.getByAltText('原订单支付二维码').waitFor();
  assert.deepEqual(recoveredIds,[preservedId]);assert.equal(writes.length,orderCount);
  await page.getByRole('button',{name:'取消付款单',exact:true}).click();
  await page.locator('.payment-error:visible').filter({hasText:'渠道尚未确认关闭'}).waitFor();
  assert.equal(detail.status,'pending');
  cancelFails=false; await page.getByRole('button',{name:'取消付款单',exact:true}).click();
  await page.getByRole('button',{name:'处理原付款单',exact:true}).waitFor({state:'hidden'});
  assert.equal(stateWrites.length,stateCount);
  console.log('PASS: cashier close retains appointment; original order recovery and provider-confirmed cancellation');

  detail={...detail,status:'paid',pay_method:'bank',pay_at:today+' 08:00:00'};
  await page.reload();
  await page.getByRole('button',{name:'登记线下退款',exact:true}).click();
  await page.getByLabel('已核实款项实际退还',{exact:true}).check();
  await page.getByRole('button',{name:'登记实际退款',exact:true}).click();
  await page.locator('.payment-error:visible').filter({hasText:'流水或凭证'}).waitFor();
  assert.equal(registrations.length,0);
  await page.getByLabel('退款流水号',{exact:true}).fill('BANK-REF-TEST');
  await page.getByLabel('凭证编号或存放位置',{exact:true}).fill('财务归档 TEST-001');
  const artifacts=process.env.UI_TEST_ARTIFACTS||os.tmpdir();
  await page.screenshot({path:path.join(artifacts,'f2-refund-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(artifacts,'f2-refund-mobile.png')});
  const bounds=await page.locator('.t-dialog:visible').boundingBox();
  assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=391,'Refund dialog fits mobile width');
  assert.ok(bounds.y>=0 && bounds.y+bounds.height<=845,'Refund dialog fits mobile height');
  await page.getByRole('button',{name:'登记实际退款',exact:true}).click();
  await page.getByRole('button',{name:'登记线下退款',exact:true}).waitFor({state:'hidden'});
  assert.equal(registrations.length,1);assert.equal(registrations[0].amount,7000);assert.equal(registrations[0].confirmed,true);
  await page.getByText(/退款.*BANK-REF-TEST/).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('缺少退款流水或凭证'));
  console.log('PASS: offline refund requires evidence, sends cents, shows actual receipt, fits desktop/mobile');
  await page.setViewportSize({width:1440,height:1000});
  detail={...detail,status:'refund_pending',pay_method:'wechat_native',shipping_address:{refund_payment_conflict:true},wechat_refund_no:null,refund_at:null};
  await page.reload();
  await page.getByRole('button',{name:'确认原路退款',exact:true}).click();
  await page.getByRole('button',{name:'同步退款结果',exact:true}).waitFor();
  await page.getByRole('button',{name:'同步退款结果',exact:true}).click();
  await page.getByText(/支付渠道退款单号：WX-REFUND-TEST/).waitFor();
  assert.equal(await page.getByRole('button',{name:'确认原路退款',exact:true}).count(),0);
  console.log('PASS: uncertain WeChat refund switches to synchronization, not duplicate submission');
  assert.deepEqual(errors,[]);
} catch(error){
  if(page){console.error('PAGE',page.url(),await page.locator('body').innerText());await page.screenshot({path:path.join(os.tmpdir(),'hanjing-cashier-failure.png'),fullPage:true});}
  throw error;
} finally {
  if(browser)await browser.close();
  server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));
}
