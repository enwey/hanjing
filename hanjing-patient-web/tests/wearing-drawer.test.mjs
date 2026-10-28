import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '@vue/compiler-dom';
import {drawerForm,checkinPayload,validCheckinDate} from '../src/wearing-drawer.js';
import {today} from '../src/ui.js';
test('drawer template is valid and escapes patient and note',()=>{
 const html=drawerForm({patientId:'21',patientName:'<test>',date:today(),record:{wearDuration:0,painScore:0,note:'<script>'}});const errors=[];parse(html,{onError:e=>errors.push(e)});assert.deepEqual(errors,[]);assert.ok(html.includes('&lt;test&gt;'));assert.ok(html.includes('&lt;script&gt;'));assert.match(html,/name="wearDuration"[^>]*value="0"/);assert.match(html,/name="painScore"[^>]*value="0"/);
});
test('unbound payload validates duration pain date and maps zero correctly',()=>{
 const input={patientId:'21',date:today(),wearDuration:0,painScore:0};assert.equal(checkinPayload(input).comfort,5);assert.ok(!('deviceId' in checkinPayload(input)));for(const change of [{wearDuration:25},{painScore:11},{painScore:1.5},{date:'2026-02-30'},{patientId:''}])assert.throws(()=>checkinPayload({...input,...change}));assert.equal(validCheckinDate('2099-01-01'),false);
});
