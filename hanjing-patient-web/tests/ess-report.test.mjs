import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '@vue/compiler-dom';
import {essReport,getEssLevelInfo} from '../src/ess-report.js';
import {page} from '../src/pages.js';
test('ESS classification follows mini program boundaries',()=>{for(const [score,level] of [[0,'正常'],[5,'正常'],[6,'轻度嗜睡'],[10,'轻度嗜睡'],[11,'中度嗜睡'],[15,'中度嗜睡'],[16,'重度嗜睡'],[24,'重度嗜睡']])assert.equal(getEssLevelInfo(score).level,level);});
test('answer review escapes content and distinguishes missing answers from zero',()=>{const html=essReport({essScore:0,essAnswers:[0,1,2,3],patientId:21},Array.from({length:5},()=>({situation:'<题目>'})));for(const text of ['正常','从不','轻度','中度','高度','未答','&lt;题目&gt;','patientId=21','评分解读','专业建议','重新评估'])assert.ok(html.includes(text),text);const errors=[];parse(html,{onError:e=>errors.push(e)});assert.deepEqual(errors,[]);});
test('missing and invalid scores never claim normal results',()=>{for(const essScore of [null,undefined,'',-1,25,'invalid']){const html=essReport({essScore});assert.ok(html.includes('待评估'));assert.ok(!html.includes('>正常<'));}});
test('report route loads real question API only for ESS',async()=>{for(const type of ['ess','ai_snore']){const calls=[];const c={page:'report',id:'a',params:new URLSearchParams('id=a&patientId=21'),get:async path=>{calls.push(path);return path.includes('ess-questions')?[{situation:'阅读'}]:[{id:'a',type,essScore:5,essAnswers:[0]}]}};const html=await page(c);assert.equal(calls.some(p=>p.includes('ess-questions')),type==='ess');assert.ok(html.includes(type==='ess'?'答案回顾':'鼾声数据详情'));}});
