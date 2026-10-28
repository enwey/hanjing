import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from '../src/pages.js';
import { fixture,device } from './fixtures.mjs';
import { painValue,shiftDay,wearingForm,comfortFromPain } from '../src/treatment.js';
import { parse } from '@vue/compiler-dom';
const context=(name,custom={})=>({page:name,params:new URLSearchParams({patientId:'21'}),get:async p=>fixture(p),...custom});
test('empty treatment keeps calendar, metrics and every feature entry',async()=>{
 const c=context('treatment',{get:async p=>p.startsWith('/treatment/record?')?null:fixture(p)});
 const html=await page(c);for(const text of ['暂无治疗记录','打卡日历','本周佩戴','平均时长','平均痛感','连续天数','睡眠趋势','睡眠报告','治疗时间线','医嘱建议','设备调整','医患社区'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('今日打卡'));assert.ok(!html.includes('待绑定设备后打卡'));assert.ok(!html.includes('undefined'));
});
test('all treatment queries and links stay scoped to selected patient',async()=>{
 const calls=[];const c=context('treatment',{get:async p=>{calls.push(p);return fixture(p)}});const html=await page(c);
 for(const p of calls.filter(p=>p.startsWith('/treatment/')))assert.equal(new URL(p,'http://test').searchParams.get('patientId'),'21');
 assert.ok(html.includes('treatment?patientId=21&amp;month=') || html.includes('treatment?patientId=21&month='));assert.ok(html.includes('treatmentAdvice?patientId=21'));
});
test('unavailable patient never falls back into someone else treatment',async()=>{
 const calls=[];const html=await page(context('treatment',{params:new URLSearchParams({patientId:'999'}),get:async p=>{calls.push(p);return fixture(p)}}));assert.ok(html.includes('无法访问所选就诊人'));assert.ok(!calls.some(p=>p.startsWith('/treatment/')));
});
test('request failure is not silently shown as empty treatment',async()=>{
 await assert.rejects(page(context('treatment',{get:async p=>{if(p.startsWith('/treatment/record?'))throw Error('failure');return fixture(p)}})),/failure/);
});
test('calendar handles leap months and marks no-data days honestly',async()=>{
 const html=await page(context('treatmentCalendar',{params:new URLSearchParams({patientId:'21',month:'2028-02'})}));assert.ok(html.includes('2028-02-29'));assert.ok(!html.includes('2028-02-30'));assert.ok(html.includes('未打卡'));
});
test('pain mapping supports legacy comfort and VAS notes, zero is not missing',()=>{
 assert.equal(painValue({painScore:0,comfort:1}),0);assert.equal(painValue({comfort:4}),2);assert.equal(painValue({note:'VAS评分：7分（重度）'}),7);assert.equal(painValue({}),null);assert.equal(shiftDay('2028-03-01',-1),'2028-02-29');
});
test('wearing form permits unbound patients and includes pain locations',()=>{
 const c=context('wearing');c.patientId='21';const html=wearingForm(c);assert.ok(html.includes('data-form="wearing"'));assert.ok(html.includes('name="painLocations"'));assert.ok(html.includes('min="0" max="10"'));assert.ok(html.includes('patientId'));
});
test('new treatment subpages have valid templates and no undefined values',async()=>{
 for(const name of ['treatmentCalendar','treatmentTrend','treatmentReport','treatmentTimeline','treatmentAdvice','treatmentAdjust']){const html=await page(context(name));const errors=[];parse(html,{onError:e=>errors.push(e.message)});assert.deepEqual(errors,[],name);assert.ok(!html.includes('undefined'),name)}
});

test('VAS to comfort uses the same thresholds as the mini program',()=>{
  for (const [pain,comfort] of [[0,5],[1,4],[2,4],[3,3],[4,3],[5,2],[7,2],[8,1],[10,1]]) assert.equal(comfortFromPain(pain),comfort);
});

test('wearing page works without requesting a treatment record',async()=>{
 const calls=[];const html=await page(context('wearing',{get:async path=>{calls.push(path);if(path.startsWith('/treatment/record?'))throw Error('must not require binding');return fixture(path)}}));
 assert.ok(html.includes('data-form="wearing"'));assert.ok(!calls.some(p=>p.startsWith('/treatment/record?')));
});
test('past calendar dates remain actionable without treatment record',async()=>{
 const html=await page(context('treatmentCalendar',{params:new URLSearchParams({patientId:'21',month:'2026-01'}),get:async p=>p.startsWith('/treatment/record?')?null:fixture(p)}));
 assert.ok(html.includes('<a data-date="2026-01-01"'));assert.ok(html.includes('patientId=21'));
});

test('overview follows mini copy and contains only requested sections',async()=>{
 const html=await page(context('treatment'));const errors=[];parse(html,{onError:e=>errors.push(e)});assert.deepEqual(errors,[]);
 for(const text of ['佩戴与睡眠数据','AI智能分析与建议','就诊全记录','医生指导方案','参数与调整记录','治疗动态'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/class="treatment-entry-icon"/g)||[]).length,6);assert.ok(!html.includes('treatment-empty-notice'));assert.ok(!html.includes('全部设备'));assert.ok(html.includes('data-patient-select hidden'));assert.ok(html.includes('patient-options'));
});

test('treatment subpages use flat range options without return or current text',async()=>{
 for(const name of ['treatmentTrend','treatmentReport','treatmentCalendar','treatmentTimeline','treatmentAdvice','treatmentAdjust']){
 const html=await page(context(name));assert.ok(!html.includes('返回治疗追踪'));assert.ok(!html.includes('当前：'));
 if(['treatmentTrend','treatmentReport'].includes(name)){assert.ok(html.includes('treatment-range-options'));assert.ok(html.includes('aria-current="true"'));assert.ok(html.includes('最近7天'));assert.ok(html.includes('最近30天'));}
 }
});
