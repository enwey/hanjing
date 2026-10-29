import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@vue/compiler-dom';
import {page} from '../src/pages.js';
test('社区、发帖及商城从管理接口加载分类并安全渲染',async()=>{
 for(const name of ['community','publish','products']){
  const calls=[];const html=await page({page:name,params:new URLSearchParams(),get:async path=>{
   calls.push(path);return path.endsWith('categories')?[{id:9,name:'新分类<测试>',code:'new-code'},{id:2,name:'第二分类',code:'second'},{id:3,name:'空分类',code:'empty'}]:path==='/community/posts'?[{id:1,tags:['新分类<测试>','第二分类']}]:path==='/products'?[{id:1,name:'商品',category:'new-code'},{id:2,name:'商品2',category:'second'}]:[];
  }});
  assert.ok(calls.includes(name==='products'?'/product-categories':'/community/categories'));
  assert.ok(html.includes('新分类&lt;测试&gt;'));assert.ok(html.indexOf('新分类')<html.indexOf('第二分类'));
  if(name==='products'){assert.match(html,/data-browse-product="new-code"/);assert.ok(!html.includes('data-browse-product="empty"'));}
  if(name==='community'){assert.match(html,/data-browse-post="新分类&lt;测试&gt;"/);assert.ok(!html.includes('data-browse-post="空分类"'));}
  const errors=[];parse(html,{onError:e=>errors.push(e.message)});assert.deepEqual(errors,[]);
 }
});
test('空分类仅显示全部，不回退固定分类',async()=>{
 for(const name of ['community','products']){
  const html=await page({page:name,params:new URLSearchParams(),get:async()=>[]});
  assert.equal((html.match(/data-browse-(post|product)=/g)||[]).length,1);
 }
});
test('社区公开分类读取管理表并按管理顺序返回',async()=>{
 const source=fs.readFileSync(new URL('../../hanjing-clinic-backend/routes/client.js',import.meta.url),'utf8');
 const start=source.indexOf("app.get('/api/v1/community/categories'");const end=source.indexOf('// GET /api/v1/community/posts',start);
 let handler,fail=false;vm.runInNewContext(source.slice(start,end),{app:{get:(p,h)=>handler=h},query:async sql=>{
  assert.match(sql,/FROM article_categories ORDER BY sort_order ASC, id ASC/);if(fail)throw Error();return [{id:7,name:'分类管理',sort_order:2}];
 }});
 let result,status;const res={json:x=>result=x,status:x=>{status=x;return res;}};
 await handler({},res);assert.equal(result.data[0].name,'分类管理');assert.equal(result.data[0].sortOrder,2);
 fail=true;await handler({},res);assert.equal(status,500);
});

test('启动不再自动补建已删除的文章分类',()=>{
 const source=fs.readFileSync(new URL('../../hanjing-clinic-backend/db.js',import.meta.url),'utf8');
 assert.ok(!/INSERT INTO article_categories/.test(source));
});
test('已删除分类即使帖子留有旧标签也不展示',async()=>{
 const html=await page({page:'community',params:new URLSearchParams(),get:async path=>path.endsWith('categories')?[{name:'当前分类'}]:[{id:1,tags:['已删除分类']} ]});
 assert.equal((html.match(/data-browse-post=/g)||[]).length,1);
});

test('商城旧商品分类不会恢复后台已删除分类',async()=>{
 const c={page:'products',params:new URLSearchParams(),get:async path=>path.endsWith('categories')?[{code:'current',name:'现有分类'}]:[{id:1,name:'旧商品',category:'deleted'}]};
 const html=await page(c);assert.equal(c.categories.length,0);assert.equal((html.match(/data-browse-product=/g)||[]).length,1);
});
