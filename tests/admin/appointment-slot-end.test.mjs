import assert from 'node:assert/strict';
import {assertFutureAppointmentTime as check} from '../../hanjing-clinic-backend/appointment-workflow.js';
const date='2026-11-04';
for(const now of ['17:29:59','17:30:00','17:45:00','17:59:59'])assert.doesNotThrow(()=>check(date,'17:30-18:00',Date.parse(`${date}T${now}+08:00`)));
for(const now of ['18:00:00','18:00:01'])assert.throws(()=>check(date,'17:30-18:00',Date.parse(`${date}T${now}+08:00`)),/已过期/);
assert.doesNotThrow(()=>check(date,'23:30-24:00',Date.parse(`${date}T23:59:59+08:00`)));
assert.throws(()=>check(date,'23:30-24:00',Date.parse('2026-11-05T00:00:00+08:00')),/已过期/);
for(const time of ['18:00-17:30','17:30','25:00-26:00','23:30-24:30','18:00-18:00'])assert.throws(()=>check(date,time,0),/已过期/);
console.log('PASS 13 end-time boundary and invalid-range checks');
