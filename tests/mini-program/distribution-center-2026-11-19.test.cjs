const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../../mp-weixin-rewrite/pages/distribution');
function page(name,api,wxOverrides={},subscribeOverrides={}){
  const file=path.join(root,name,'index.js');let p;const toasts=[];
  if (name === 'withdraw') api = { getWithdrawBankCards: async () => ({ list: [] }), ...api };
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:x=>{p=x;x.setData=(v,cb)=>{Object.assign(x.data,v);cb?.();};},
    require:id=>id.endsWith('/subscribe')?subscribeOverrides:id.includes('navigation')?{}:id.includes('session-store')?{getAccessToken:()=> 'fixture', getLoginGeneration:()=>1}:id.includes('api/index')?api:require(path.resolve(path.dirname(file),id+'.js')),
    wx:{showToast(v){toasts.push(v.title);}, ...wxOverrides},console});
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
test('提现：统一使用最低提现金额限制输入',async()=>{
 const p=page('withdraw',{getDistributorInfo:async()=>({availableCommission:10000,minWithdrawAmount:1000,bankMinWithdrawAmount:5000,withdrawFeeRates:{bank:0.02}})});
 await p.loadPage();Object.assign(p.data,{bankName:'测试银行',bankAccountName:'测试',bankAccountNo:'123',withdrawAmountInput:'49.99'});p.refreshAmountSummary();
 assert.equal(p.data.minWithdrawAmount,10);assert.ok(p.data.isSubmitEnabled);
 p.data.withdrawAmountInput='9.99';p.refreshAmountSummary();assert.equal(p.data.isSubmitEnabled,false);
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

test('提现：金额校验提示具体原因，更正后清除提示', async () => {
  let submissions = 0;
  const p = page('withdraw', {
    getDistributorInfo: async () => ({
      availableCommission: 5000, minWithdrawAmount: 100, withdrawFeeRates: { bank: 0.02 },
    }),
    applyWithdraw: async () => { submissions++; },
  });
  await p.loadPage();
  Object.assign(p.data, { bankName: '测试银行', bankAccountName: '测试', bankAccountNo: '12345678' });

  for (const [value, message] of [
    ['', '请输入提现金额'],
    ['10.123', '请输入有效金额，最多保留两位小数'],
    ['0.99', '最低提现金额为 1 元'],
    ['50.01', '可提现余额为 50.00 元，输入金额已超出'],
    ['1', '扣除手续费后，到账金额须大于 0 元'],
  ]) {
    p.handleAmountInput({ detail: { value } });
    assert.equal(p.data.amountError, value ? message : '');
    assert.equal(p.data.isSubmitEnabled, false);
    await p.submitWithdraw();
    assert.equal(p.toasts.at(-1), message);
    assert.equal(p.data.withdrawAmountInput, value);
  }
  assert.equal(submissions, 0);

  for (const value of ['1.01', '50.00']) {
    p.handleAmountInput({ detail: { value } });
    assert.equal(p.data.amountError, '');
    assert.equal(p.data.isSubmitEnabled, true);
  }

  for (const [field, message] of [
    ['bankName', '请输入开户银行'],
    ['bankAccountName', '请输入开户姓名'],
    ['bankAccountNo', '请输入银行卡号'],
  ]) {
    const original = p.data[field];
    p.handleBankInput({ currentTarget: { dataset: { field } }, detail: { value: ' ' } });
    await p.submitWithdraw();
    assert.equal(p.toasts.at(-1), message);
    assert.equal(p.data.amountError, '');
    assert.equal(p.data.isSubmitEnabled, false);
    p.handleBankInput({ currentTarget: { dataset: { field } }, detail: { value: original } });
  }
  assert.equal(submissions, 0);
  assert.equal(p.data.isSubmitEnabled, true);
});

test('提现：历史卡默认选最近提交，支持换卡、编辑和删除', async () => {
  const latest = { id: '12', bankName: '银行一', accountName: '测试', maskedAccountNo: '**** 4321' };
  const older = { id: '7', bankName: '银行二', accountName: '测试', maskedAccountNo: '**** 1234' };
  let cards = [latest, older];
  const p = page('withdraw', {
    getDistributorInfo: async () => ({
      availableCommission: 5000, minWithdrawAmount: 1000, withdrawFeeRates: { bank: 0.02 },
    }),
    getWithdrawBankCards: async () => ({ list: cards }),
    updateWithdrawBankCard: async (id, fields) => {
      assert.equal(id, latest.id);
      assert.equal(fields.accountNo, '');
      return { ...latest, bankName: fields.bankName };
    },
    deleteWithdrawBankCard: async id => {
      cards = cards.filter(card => card.id !== id);
    },
    applyWithdraw: async (amount, method, info, id) => {
      assert.equal(amount, 2000);
      assert.equal(method, 'bank');
      assert.equal(info, null);
      assert.equal(id, older.id);
      cards = [older, latest];
    },
  });

  const tap = id => ({ currentTarget: { dataset: { id } } });
  await p.loadPage();
  assert.equal(p.data.selectedCardId, latest.id);
  assert.equal(p.data.bankName, '');
  assert.equal(p.data.bankAccountNo, '');
  p.editSavedCard(tap(latest.id));
  assert.equal(p.data.bankName, latest.bankName);
  p.data.bankName = '更新银行';
  await p.saveCardEdit();
  assert.equal(p.data.bankCards[0].bankName, '更新银行');
  assert.equal(p.data.selectedCardId, latest.id);
  p.enterNewCard();
  assert.equal(p.data.selectedCardId, '');
  assert.equal(p.data.bankName, '');
  p.selectSavedCard(tap(older.id));
  p.handleAmountInput({ detail: { value: '20' } });
  assert.equal(p.data.isSubmitEnabled, true);
  await p.submitWithdraw();
  assert.equal(p.data.selectedCardId, older.id);
  assert.equal(p.data.withdrawAmountInput, '');
  await p.deleteSavedCard(older.id);
  assert.equal(p.data.selectedCardId, latest.id);
  await p.deleteSavedCard(latest.id);
  assert.equal(p.data.selectedCardId, '');
  assert.equal(p.data.bankCards.length, 0);
});

test('提现：旧后端缺少历史银行卡接口时仍可手填，其他错误照常显示', async () => {
  let statusCode = 404;
  let submissions = 0;
  const p = page('withdraw', {
    getDistributorInfo: async () => ({
      availableCommission: 5000, minWithdrawAmount: 1000, withdrawFeeRates: { bank: 0.02 },
    }),
    getWithdrawBankCards: async () => {
      throw Object.assign(new Error('历史银行卡接口错误'), { statusCode });
    },
    applyWithdraw: async (_amount, _method, fields, cardId) => {
      assert.equal(fields.accountNo, '12345678');
      assert.equal(cardId, undefined);
      submissions++;
    },
  });

  await p.loadPage();
  assert.equal(p.data.hasLoaded, true);
  assert.equal(p.data.loadError, '');
  assert.equal(p.data.selectedCardId, '');
  Object.assign(p.data, { bankName: '测试银行', bankAccountName: '测试', bankAccountNo: '12345678' });
  p.handleAmountInput({ detail: { value: '20' } });
  assert.equal(p.data.isSubmitEnabled, true);
  await p.submitWithdraw();
  assert.equal(submissions, 1);

  statusCode = 500;
  await p.loadPage();
  assert.equal(p.data.hasLoaded, false);
  assert.equal(p.data.loadError, '历史银行卡接口错误');
});

test('微信零钱授权弹窗结果以服务端确认状态为准，已授权后可以直接提交', async () => {
  const calls = [];
  let providerAuthorized = false;
  let popups = 0;
  const p = page('withdraw', {
    getDistributorInfo: async () => ({
      availableCommission: 300000, minWithdrawAmount: 100, withdrawFeeRates: { bank: 0.02 },
      wechatWithdrawEnabled: true, wechatWithdrawMin: 200, wechatWithdrawMax: 250000,
    }),
    getWechatWithdrawAuthorization: async prepare => ({
      enabled: true, authorized: providerAuthorized,
      ...(prepare ? { mchId: 'test-mch', appId: 'test-app', package: 'test-package' } : {}),
    }),
    applyWithdraw: async (...args) => calls.push(args),
  }, {
    requestMerchantTransfer(opts) {
      popups++;
      assert.equal(opts.package, 'test-package');
      opts.complete({ errMsg: 'requestMerchantTransfer:ok' });
    },
  });
  await p.loadPage();
  assert.equal(p.data.withdrawMethod, 'bank');
  const selectWechat = { currentTarget: { dataset: { method: 'wechat' } } };
  await p.chooseMethod(selectWechat);
  p.handleAmountInput({ detail: { value: '25' } });
  assert.equal(p.data.isSubmitEnabled, false);
  await p.authorizeWechat();
  assert.equal(popups, 1);
  assert.equal(p.data.isSubmitEnabled, false);
  providerAuthorized = true;
  await p.chooseMethod(selectWechat);
  assert.equal(p.data.isSubmitEnabled, true);
  assert.equal(popups, 1);
  assert.equal(p.data.serviceFeeLabel, '¥0.00');
  assert.equal(p.data.actualAmountLabel, '¥25.00');
  p.handleAmountInput({ detail: { value: '2500.01' } });
  assert.equal(p.data.amountError, '微信零钱单笔最高提现金额为 2500.00 元');
  p.handleAmountInput({ detail: { value: '2000' } });
  assert.equal(p.data.needsWechatName, true);
  assert.equal(p.data.isSubmitEnabled, false);
  p.handleWechatNameInput({ detail: { value: '示例姓名' } });
  await p.submitWithdraw();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 200000);
  assert.equal(calls[0][1], 'wechat');
  assert.equal(calls[0][2], undefined);
  assert.equal(calls[0][4].realName, '示例姓名');
  assert.match(calls[0][4].requestId, /^[a-z0-9]{16,64}$/);
  assert.equal(p.data.wechatRealName, '');
});

test('微信零钱提现网络异常重试沿用同一请求号', async () => {
  const keys = [];
  const p = page('withdraw', {
    getDistributorInfo: async () => ({
      availableCommission: 100000, minWithdrawAmount: 100, withdrawFeeRates: { bank: 0.02 },
      wechatWithdrawEnabled: true, wechatWithdrawMax: 100000,
    }),
    getWechatWithdrawAuthorization: async () => ({ enabled: true, authorized: true }),
    applyWithdraw: async (...args) => {
      keys.push(args[4].requestId);
      if (keys.length === 1) throw new Error('网络超时');
    },
  });
  await p.loadPage();
  await p.chooseMethod({ currentTarget: { dataset: { method: 'wechat' } } });
  p.handleAmountInput({ detail: { value: '25.00' } });
  await p.submitWithdraw();
  await p.submitWithdraw();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test('提现：确认点击直接申请订阅，拒绝后仍可提交', async () => {
  const actions = [];
  const p = page('withdraw', {
    getDistributorInfo: async () => ({ availableCommission: 5000, minWithdrawAmount: 100, withdrawFeeRates: { bank: 0.02 } }),
    applyWithdraw: async () => actions.push('withdraw'),
  }, { requestSubscribeMessage() {} }, {
    requestSubscribe: async options => { actions.push('prompt:' + options.scene); return { result: 'reject' }; },
  });
  await p.loadPage();
  Object.assign(p.data, { withdrawAmountInput: '20', bankName: '测试银行', bankAccountName: '测试', bankAccountNo: '12345678' });
  const saving = p.submitWithdraw();
  assert.deepEqual(actions, ['prompt:withdraw', 'withdraw'], '授权和业务都从同一个点击触发');
  await saving;
  assert.ok(p.toasts.includes('提现申请已提交'));
});
