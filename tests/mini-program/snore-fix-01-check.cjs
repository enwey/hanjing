const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/snore-functional.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('(async()=>{'))+'module.exports={backend,valid,recording};',box);
const {backend,valid,recording}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
(async()=>{
 await check('concurrent identical retries return same id with one insert',async()=>{const h=backend(),body={...valid,localId:'parallel'};const rs=await Promise.all([h.call(body),h.call(body)]);assert.ok(rs.every(r=>r.status===200));assert.equal(rs[0].payload.data.id,rs[1].payload.data.id);assert.equal(h.writes.length,1);});
 await check('same key with changed contents returns conflict without another insert',async()=>{const h=backend();await h.call({...valid,localId:'conflict'});const r=await h.call({...valid,localId:'conflict',duration:6});assert.equal(r.status,409);assert.equal(h.writes.length,1);});
 await check('different recordings with identical measurements remain distinct',async()=>{const h=backend();await h.call({...valid,localId:'one'});await h.call({...valid,localId:'two'});assert.equal(h.writes.length,2);});
 await check('legacy timestamp queue retries deduplicate',async()=>{const h=backend(),body={...valid,timestamp:123456};await h.call(body);await h.call(body);assert.equal(h.writes.length,1);});
 await check('initial upload and queued retry keep same recording identity',async()=>{let sent;const h=recording({submitSnoreRecording:async body=>{sent=body;throw Error('lost response');}});await h.p.submitRecording();assert.ok(sent.localId);assert.equal(h.storage.pending_snore_uploads[0].localId,sent.localId);assert.equal(h.storage.pending_snore_uploads[0].timestamp,sent.timestamp);});
 console.log(JSON.stringify({scope:'developer isolation checks; unique constraint simulated, not real MySQL',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
