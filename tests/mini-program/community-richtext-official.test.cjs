const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { articleRichText } = require('../../mp-weixin-rewrite/common/utils/article-rich-text');

test('圖文直接交給rich-text，支持一層及多層轉義', () => {
  const html='<div style="color:#3b6bf5"><p>患者提问</p><p>医生回答</p></div>';
  assert.equal(articleRichText(html),html);
  const escaped=html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  assert.equal(articleRichText(escaped),html);
  assert.equal(articleRichText(escaped.replace(/&/g,'&amp;')),html);
  assert.equal(articleRichText('<p>保留 &lt;5 的文字</p>'),'<p>保留 &lt;5 的文字</p>');
});
test('普通文字保留換行，數學符號不會被當標籤', () => {
  assert.deepEqual(articleRichText('普通文字\n第二行 <5'),[{name:'div',children:[{type:'text',text:'普通文字'},{name:'br'},{type:'text',text:'第二行 <5'}]}]);
});
test('實際詳情處理器使用richContent並正確識別官方', async () => {
  let config;const payload={id:1,author:'兴康明诊所',role:'admin',roleLabel:'诊所官方',content:'&lt;p&gt;正文&lt;/p&gt;'};
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/community/detail/index.js','utf8'),{
    require:name=>name.includes('article-rich-text')?{articleRichText}:name.includes('date-time')?{formatChinaDateTime:()=>''}:{getCommunityPostDetail:async()=>({data:payload}),getUserProfile:async()=>null},
    Page:x=>config=x,wx:{},console
  });
  const instance={...config,data:JSON.parse(JSON.stringify(config.data)),setData(x){Object.assign(this.data,x)}};
  await instance.loadPostDetail('1');
  assert.equal(instance.data.postDetail.richContent,'<p>正文</p>');
  assert.equal(instance.data.postDetail.content,payload.content);
  assert.equal(instance.data.postDetail.isOfficial,true);
  payload.role='patient';await instance.loadPostDetail('1');assert.equal(instance.data.postDetail.isOfficial,false);
});

test('實際列表處理器只有官方身份顯示認證徽標', async () => {
  let config;
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/community/index.js','utf8'),{
    require:name=>name.includes('date-time')?{formatChinaDateTime:()=>''}:{getCommunityPosts:async()=>({data:[{id:1,role:'admin',author:'兴康明诊所'},{id:2,role:'patient',author:'普通用户'}]})},
    Page:x=>config=x,wx:{},console
  });
  const instance={...config,data:JSON.parse(JSON.stringify(config.data)),setData(x){Object.assign(this.data,x)}};
  await instance.loadPosts();
  assert.equal(instance.data.posts.find(p=>p.id==='1').isOfficial,true);
  assert.equal(instance.data.posts.find(p=>p.id==='2').isOfficial,false);
});

const richPackage='deliverables/community-qa-2026-10-29/articles.richtext.json';
test('本地30篇圖文原內容完整交給rich-text', {skip:!fs.existsSync(richPackage)&&'本地圖文資料包未提供'}, () => {
  for(const a of JSON.parse(fs.readFileSync(richPackage,'utf8')).articles)assert.equal(articleRichText(a.content),a.content);
});
