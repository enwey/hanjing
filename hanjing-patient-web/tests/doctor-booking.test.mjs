import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '@vue/compiler-dom';
import {page} from '../src/pages.js';
import {fixture} from './fixtures.mjs';
test('integrated doctor page has valid template and scopes schedules',async()=>{
 const paths=[];const c={page:'doctors',params:new URLSearchParams({id:'11',storeId:'9'}),get:async p=>{paths.push(p);return fixture(p)}};const html=await page(c);const errors=[];parse(html,{onError:e=>errors.push(e)});assert.deepEqual(errors,[]);assert.ok(html.includes('doctor-booking-layout'));assert.ok(html.includes('data-clinic-schedule="31"'));assert.ok(paths.includes('/schedules?storeId=9&doctorId=11'));assert.equal(c.doctorId,'11');
});
test('unmapped store never gets schedule data or booking action',async()=>{
 const paths=[];const c={page:'doctors',params:new URLSearchParams({id:'11',storeId:'999'}),get:async p=>{paths.push(p);return fixture(p)}};const html=await page(c);assert.ok(html.includes('该门店暂不可预约'));assert.ok(!paths.some(p=>p.startsWith('/schedules')));
});

test('calendar handles leap days and disallows dates without schedules',async()=>{const {doctorCalendar}=await import('../src/doctor-booking.js');const html=doctorCalendar({clinicMonth:'2096-02',schedules:[{id:1,date:'2096-02-29',status:'available'}]});const errors=[];parse(html,{onError:e=>errors.push(e)});assert.deepEqual(errors,[]);assert.match(html,/data-clinic-date="2096-02-29" data-clinic-schedule="1"/);assert.match(html,/data-clinic-date="2096-02-28" disabled/);assert.ok(!html.includes('2096-02-30'));});

test('available slots filter, normalize, deduplicate and retain valid schedule identity',async()=>{const {availableTimeSlots,timeSlotGroups}=await import('../src/doctor-booking.js');const slots=availableTimeSlots([{scheduleId:1,label:'09:00-09:30',status:'booked'},{scheduleId:2,label:'9:00 – 9:30',status:'available'},{scheduleId:3,label:'09:00-09:30',status:'available'},{scheduleId:4,label:'14:00-14:30',status:'available'},{scheduleId:5,label:'12:00-12:30',status:'available'},{scheduleId:6,label:'25:00-25:30',status:'available'}]);assert.equal(slots.length,3);assert.equal(slots[0].scheduleId,2);assert.equal(slots[0].label,'9:00 – 9:30');assert.equal(slots[0].displayLabel,'09:00-09:30');const html=timeSlotGroups(slots);const errors=[];parse(html,{onError:e=>errors.push(e)});assert.deepEqual(errors,[]);assert.ok(html.includes('上午'));assert.ok(html.includes('下午'));assert.equal((html.match(/data-clinic-time=/g)||[]).length,3);assert.ok(timeSlotGroups([]).includes('暂无可预约时段'));});

test('doctor detail hero tags match mini experience title and specialty, not expertise',async()=>{const {doctorDetail,doctorCard}=await import('../src/clinic.js');const d={id:1,name:'医生',experience:25,title:'主任医师',specialty:'睡眠呼吸科',expertise:['阻鼾器适配'],consultFee:10000};const html=doctorDetail(d,'9',true);const hero=html.split('clinic-doctor-sections')[0];assert.ok(hero.includes('<span>25年经验</span>'));assert.ok(hero.includes('<span>主任医师</span>'));assert.ok(hero.includes('<span>睡眠呼吸科</span>'));assert.ok(!hero.includes('阻鼾器适配'));assert.ok(html.split('clinic-doctor-sections')[1].includes('阻鼾器适配'));assert.ok(doctorCard(d).includes('阻鼾器适配'));});
