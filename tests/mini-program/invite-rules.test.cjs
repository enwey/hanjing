const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('mp-weixin-rewrite/pages/distribution/invite/index.js','utf8');
function setup(api){let config;vm.runInNewContext(source,{require:n=>n==='../../../api/index'?api:n==='./invite-design'?{copy:{}}:n==='../utils/rules'?require('../../mp-weixin-rewrite/pages/distribution/utils/rules'):{},Page:p=>config=p});return {...config,data:{...config.data},setData(v){Object.assign(this.data,v)}};}
test('inline rules use all four API groups and preserve invitation data',async()=>{
 const payload={qualificationText:'开通条件测试',commissionRules:['佣金规则测试'],promotionWays:['推广方式测试'],withdrawRules:['提现规则测试']};
 const page=setup({getDistributionRules:async()=>({data:payload})});page.data.inviteCode='HJ123';
 await page.loadInviteRules();assert.equal(page.data.ruleSections.length,4);assert.equal(page.data.ruleSections[1].items[0],payload.commissionRules[0]);assert.equal(page.data.inviteCode,'HJ123');assert.equal(page.data.rulesLoading,false);
});
test('rules failure preserves loaded rules and can retry; empty payload clears old rules',async()=>{
 let fail=true;const page=setup({getDistributionRules:async()=>{if(fail)throw Error('offline');return {};}});page.data.ruleSections=[{title:'原有规则',items:['规则']}];
 await page.loadInviteRules();assert.equal(page.data.rulesError,true);assert.equal(page.data.ruleSections.length,1);assert.equal(page.data.rulesLoading,false);
 fail=false;await page.loadInviteRules();assert.equal(page.data.rulesError,false);assert.equal(page.data.ruleSections.length,1);assert.equal(page.data.ruleSections[0].items[0],'当前暂无分销开通说明');
});
test('invitation matches actual center handler for direct, wrapped and nested dynamic responses',async()=>{
 for(const wrap of [p=>p,p=>({data:p}),p=>({data:{data:p}})]) {
  let current={qualificationText:'服务端条件',commissionRules:['冻结 17 天'],promotionWays:['服务端推广方式'],withdrawRules:['最低提现 ¥123.45','手续费 2.75%']};
  const api={getDistributionRules:async()=>wrap(current),getDistributorInfo:async()=>({}),getDistributionOrders:async()=>[]};
  let centerConfig;
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/distribution/center/index.js','utf8'),{require:n=>n==='../../../api/index'?api:n==='../utils/rules'?require('../../mp-weixin-rewrite/pages/distribution/utils/rules'):n.includes('date-time')?{formatChinaDate:()=>''}:{},Page:p=>centerConfig=p,wx:{showToast:()=>assert.fail('center load failed')}});
  const center={...centerConfig,data:{...centerConfig.data},setData(v){Object.assign(this.data,v)}};
  const invite=setup(api);
  for(let round=0;round<2;round++) {
   await Promise.all([center.loadPage(),invite.loadInviteRules()]);
   assert.equal(invite.data.ruleSections[0].items[0],center.data.qualificationText);
   for(const [index,key] of [[1,'commissionRules'],[2,'promotionWays'],[3,'withdrawRules']])assert.deepEqual(Array.from(invite.data.ruleSections[index].items),Array.from(center.data[key]));
   current={...current,commissionRules:['冻结 3 天'],withdrawRules:['最低提现 ¥5.00','手续费 0.5%']};
  }
 }
});
