import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {page,postCard} from '../src/pages.js';
const brand='/static/images/brand-logo.png';
test('PC官方列表和详情固定品牌头像，忽略空头像和历史个人头像',async()=>{
 for(const avatar of ['', '/old-user.png']){
  const post={id:1,role:'admin',author:'兴康明诊所',avatar,comments:[]};
  for(const html of [postCard(post),await page({page:'post',params:new URLSearchParams({id:'1'}),get:async()=>post})]){
   assert.match(html,/class="community-official-avatar"/);assert.ok(!html.includes('/old-user.png'));
  }
 }
 assert.equal(fs.readFileSync(new URL('../public'+brand,import.meta.url)).equals(fs.readFileSync(new URL('../../mp-weixin-rewrite'+brand,import.meta.url))),true);
});
test('小程序真实标准化函数固定官方头像、保留普通用户头像',()=>{
 for(const [file,fn] of [['index.js','normalizePost'],['detail/index.js','normalizePostDetail']]){
  const code=fs.readFileSync(new URL('../../mp-weixin-rewrite/pages/community/'+file,import.meta.url),'utf8');
  const context={require:n=>n.includes('date-time')?{formatChinaDateTime:()=>''}:n.includes('article-rich-text')?{articleRichText:x=>x}:{},Page:()=>{}};
  vm.createContext(context);vm.runInContext(code,context);
  for(const avatar of ['', '/old-user.png'])assert.equal(context[fn]({role:'admin',avatar}).avatar,brand);
  assert.equal(context[fn]({role:'patient',avatar:'/user.png'}).avatar,'/user.png');
 }
});
