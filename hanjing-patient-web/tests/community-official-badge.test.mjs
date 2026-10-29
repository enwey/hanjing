import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@vue/compiler-dom';
import { communityPublisherIdentity } from '../src/community-publisher.js';
import { page, postCard } from '../src/pages.js';

const official={id:4,role:'admin',roleLabel:'诊所官方',author:'兴康明诊所',title:'科普问答',content:'正文',createdAt:'2026-10-29',comments:[]};
test('官方徽標與名字獨立，僅admin身份可顯示',()=>{
  const html=communityPublisherIdentity(official);
  assert.match(html,/community-official-badge/);assert.match(html,/>官方<\/span>/);
  assert.ok(!html.includes(' · 诊所官方'));
  assert.ok(!communityPublisherIdentity({...official,role:'patient'}).includes('community-official-badge'));
  assert.match(communityPublisherIdentity({...official,role:'doctor',roleLabel:'专家医生'}),/专家医生/);
});
test('社區列表與詳情使用相同官方徽標，HTML結構有效',async()=>{
  const list=postCard(official),detail=await page({page:'post',params:new URLSearchParams({id:'4'}),get:async()=>official});
  for(const html of [list,detail]){
    assert.equal((html.match(/class="community-official-badge"/g)||[]).length,1);
    const errors=[];parse(html,{onError:e=>errors.push(e.message)});assert.deepEqual(errors,[]);
  }
  assert.match(detail,/<time>2026-10-29<\/time>/);
});
test('發布者名稱安全轉義，原用戶標識保持',()=>{
  const html=communityPublisherIdentity({author:'<img onerror=alert(1)>',role:'patient',roleLabel:'鼾友'});
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.match(html,/鼾友/);
});
test('PC徽標資產與小程序使用同一SVG',()=>{
  const pc=fs.readFileSync(new URL('../public/static/icons/official-verified.svg',import.meta.url),'utf8');
  const mini=fs.readFileSync(new URL('../../mp-weixin-rewrite/static/icons/official-verified.svg',import.meta.url),'utf8');
  assert.equal(pc,mini);
});
