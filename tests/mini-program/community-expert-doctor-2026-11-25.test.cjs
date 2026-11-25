const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('专家栏包含关联医生或专家身份帖子，普通标签不改变作者身份',async()=>{
  let config;
  const fixtures=[{id:1,role:'admin',author:'诊所',hasRelatedDoctor:true},{id:2,role:'patient',author:'用户',tags:['专家']},{id:3,role:'doctor',author:'医生'},{id:4,role:'expert',author:'专家'},{id:5,role:'patient',hasRelatedDoctor:false}];
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/community/index.js','utf8'),{
    require:n=>n.includes('image-url')?{normalizeImageUrl:x=>x,BRAND_LOGO:'/logo.png'}:n.includes('date-time')?{formatChinaDateTime:x=>x}:{getCommunityPosts:async()=>({data:fixtures})},
    Page:p=>config=p,wx:{showToast(){throw Error('加载失败')}},console,
  });
  const page={...config,data:{...config.data},setData(v){Object.assign(this.data,v)}};
  await page.loadPosts();page.refreshVisiblePosts('expert');
  assert.deepEqual(Array.from(page.data.visiblePosts,p=>p.id).sort(),['1','3','4']);
  const linked=page.data.visiblePosts.find(p=>p.id==='1');
  assert.equal(linked.role,'admin');assert.equal(linked.author,'诊所');assert.equal(linked.isOfficial,true);
  page.refreshVisiblePosts('latest');assert.equal(page.data.visiblePosts.length,5);
});
