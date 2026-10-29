import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveArticlePublisher, communityPublisher } from '../../hanjing-clinic-backend/article-publisher.js';

test('未選擇發布者時建立品牌身份，不依賴首個患者', async () => {
  let params;
  const author = await resolveArticlePublisher(null, { run: async (sql, p) => { params=p; }, get: async () => ({id:69}) });
  assert.deepEqual(author,{id:69,role:'admin'});
  assert.equal(params[1],'兴康明诊所');
});
test('指定有效用戶，不建立品牌；錯誤及不存在的ID必須拒絕', async () => {
  const db={get:async(sql,[id])=>id===2?{id:2,openid:'wechat-id'}:null,run:async()=>{throw Error('不得建立品牌')}};
  assert.deepEqual(await resolveArticlePublisher('2',db),{id:2,role:'patient'});
  for(const id of [0,-1,'1 OR 1=1',{},true,999])await assert.rejects(resolveArticlePublisher(id,db));
});
test('官方文章顯示品牌，普通作者與專家身份保持', () => {
  assert.deepEqual(communityPublisher({user_role:'admin',author_name:'错误患者'}),{author:'兴康明诊所',avatar:'/api/v1/community/brand-logo.png',role:'admin',roleLabel:'诊所官方'});
  assert.equal(communityPublisher({user_role:'patient',author_name:'甲'}).author,'甲');
  assert.equal(communityPublisher({user_role:'doctor'}).roleLabel,'专家医生');
});
test('實際文章新增與更新處理器保存發布者；審核不重綁', async () => {
  const source=await fs.readFile(new URL('../../hanjing-clinic-backend/routes/admin.js',import.meta.url),'utf8');
  const handlers={};const posts=new Map();let nextId=1;
  const get=async(sql,args)=>sql.includes('FROM community_posts')?posts.get(String(args[0])):sql.includes('openid=?')?{id:69}:args[0]===2?{id:2,openid:'wx'}:null;
  const run=async(sql,args)=>{
    assert.equal((sql.match(/\?/g)||[]).length,args.length,'SQL佔位符與參數必須一致');
    if(sql.includes('INSERT INTO community_posts')){const id=String(nextId++);posts.set(id,{id,user_id:args[0],user_role:args[1],title:args[2],content:args[4]});return {id};}
    if(sql.includes('UPDATE community_posts')){const p=posts.get(String(args.at(-1)));p.user_id=args.at(-3);p.user_role=args.at(-2);}
    return {};
  };
  const start=source.indexOf("app.post('/api/admin/content/articles',");
  const end=source.indexOf("app.delete('/api/admin/content/articles/:id'",start);
  new Function('app','authenticateToken','get','run','resolveArticlePublisher','logAdminAction',source.slice(start,end))({post:(p,...h)=>handlers.post=h.at(-1),put:(p,...h)=>handlers.put=h.at(-1)},()=>{},get,run,resolveArticlePublisher,async()=>{});
  const res={status(s){this.httpStatus=s;return this},json(v){this.result=v}};
  await handlers.post({body:{title:'問答',content:'正文'},user:{id:1}},res);
  assert.equal(res.result.code,200);assert.equal(posts.get('1').user_id,69);
  await handlers.post({body:{title:'用戶文章',content:'正文',author_id:2},user:{id:1}},res);
  assert.equal(posts.get('2').user_id,2);
  await handlers.put({params:{id:'2'},body:{status:'approved'},user:{id:1}},res);
  assert.equal(posts.get('2').user_id,2);
  await handlers.put({params:{id:'2'},body:{author_id:null},user:{id:1}},res);
  assert.equal(posts.get('2').user_id,69);assert.equal(posts.get('2').user_role,'admin');
});
