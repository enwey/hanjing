const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../../mp-weixin-rewrite/pages/distribution');
function page(name,api){
  const file=path.join(root,name,'index.js');let p;const toasts=[];
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:x=>{p=x;x.setData=(v,cb)=>{Object.assign(x.data,v);cb?.();};},
    require:id=>id.includes('navigation')?{}:id.includes('session-store')?{getAccessToken:()=> 'fixture'}:id.includes('api/index')?api:require(path.resolve(path.dirname(file),id+'.js')),
    wx:{showToast(v){toasts.push(v.title);}},console});
  p.toasts=toasts;return p;
}
for(const [name,methods,key,record] of [
  ['orders',['getDistributionOrders'],'orders',{id:'x'}],
  ['commission',['getDistributionCommissions','getDistributionCommissionStats'],'commissions',{id:'x'}],
  ['team',['getTeamMembers','getDistributorInfo'],'members',{id:'x'}],
  ['products',['getDistributionProducts'],'products',{id:'x'}],
]){
 test(name+'：较早请求晚到不能覆盖新数据',async()=>{
  let release;const delayed=new Promise(r=>release=r);let calls=0;
  const api={[methods[0]]:()=>++calls===1?delayed:Promise.resolve([{...record,id:'new',name:'新',productName:'新'}])};
  if(methods[1])api[methods[1]]=async()=>({});
  const p=page(name,api);const old=p.loadPage();await p.loadPage();
  assert.equal(p.data[key]?.[0]?.id,'new','新响应必须先显示');
  release([{...record,id:'old',name:'旧',productName:'旧'}]);await old;
  assert.equal(p.data[key]?.[0]?.id,'new','旧响应覆盖新数据');
 });
}
test('提现：超额和三位小数拦截；合法金额连续提交只发一次',async()=>{
 let finish;const pending=new Promise(r=>finish=r);const calls=[];
 const p=page('withdraw',{getDistributorInfo:async()=>({availableCommission:5000,minWithdrawAmount:1000,withdrawFeeRates:{bank:0.02}}),
  applyWithdraw:(...args)=>{calls.push(args);return pending;}});
 await p.loadPage();Object.assign(p.data,{bankName:'测试银行',bankAccountName:'测试',bankAccountNo:'123'});
 for(const value of ['51','10.001']){p.data.withdrawAmountInput=value;await p.submitWithdraw();}
 assert.equal(calls.length,0);
 p.data.withdrawAmountInput='20.00';const first=p.submitWithdraw();await p.submitWithdraw();
 assert.equal(calls.length,1);assert.equal(calls[0][0],2000);assert.equal(p.data.actualAmountLabel,'¥19.00');
 finish();await first;
});
test('提现：使用银行卡最低提现金额限制输入',async()=>{
 const p=page('withdraw',{getDistributorInfo:async()=>({availableCommission:10000,minWithdrawAmount:1000,bankMinWithdrawAmount:5000,withdrawFeeRates:{bank:0.02}})});
 await p.loadPage();Object.assign(p.data,{bankName:'测试银行',bankAccountName:'测试',bankAccountNo:'123',withdrawAmountInput:'49.99'});p.refreshAmountSummary();
 assert.equal(p.data.minWithdrawAmount,50);assert.equal(p.data.isSubmitEnabled,false);
 p.data.withdrawAmountInput='50.00';p.refreshAmountSummary();assert.ok(p.data.isSubmitEnabled);
});
for(const [name,method,key,extra] of [
 ['commission','getDistributionCommissions','commissions',{getDistributionCommissionStats:async()=>({})}],
 ['team','getTeamMembers','members',{getDistributorInfo:async()=>({})}],
 ['products','getDistributionProducts','products',{}],
]){
 test(name+'：新数据已显示后旧请求失败不提示；最新请求失败仍提示',async()=>{
  let reject;let calls=0;
  const pending=new Promise((_,r)=>{reject=r;});
  const p=page(name,{...extra,[method]:()=>{switch(++calls){case 1:return pending;case 2:return Promise.resolve([{id:'new'}]);default:return Promise.reject(Error('最新错误'));}}});
  const old=p.loadPage();await p.loadPage();
  assert.equal(p.data[key][0].id,'new');
  reject(Error('过期错误'));await old;
  assert.equal(p.data[key][0].id,'new');
  assert.equal(p.data.loadError,'');
  assert.equal(p.data.loading,false);
  assert.deepEqual(p.toasts,[]);
  await p.loadPage({silent:true});
  assert.deepEqual(p.toasts,['最新错误']);
 });
}
for(const name of ['center','withdraw']){
 test(name+'：新余额先返回后不会被旧余额覆盖',async()=>{
  let release;const pending=new Promise(r=>release=r);let calls=0;
  const info=availableCommission=>({availableCommission,minWithdrawAmount:1000,withdrawFeeRates:{bank:0.02}});
  let submissions=0;
  const p=page(name,{applyWithdraw:async()=>{submissions++;},getDistributorInfo:()=>++calls===1?pending:Promise.resolve(info(5000)),getDistributionOrders:async()=>[],getDistributionRules:async()=>({})});
  const old=p.loadPage();await p.loadPage();assert.equal(p.data.availableCommissionLabel,'¥50.00');
  release(info(9000));await old;assert.equal(p.data.availableCommissionLabel,'¥50.00');
  if(name==='withdraw'){
   Object.assign(p.data,{withdrawAmountInput:'60',bankName:'测试银行',bankAccountName:'测试',bankAccountNo:'123'});
   await p.submitWithdraw();assert.equal(p.data.isSubmitEnabled,false);assert.equal(submissions,0);
  }
 });
}
