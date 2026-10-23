const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/two-level-commission.cjs','utf8');
const ctx={require,__dirname,module:{exports:{}},setImmediate};
vm.runInNewContext(source.slice(0,source.lastIndexOf('\n(async()=>{'))+'\nmodule.exports={backend,accrue};',ctx);
const {backend,accrue}=ctx.module.exports,results=[];
function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(t=>[v,...t])):[[]];}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
const expected={2:[['A',1,1000],['E',2,500]],3:[['B',1,1000],['A',2,500]],4:[['C',1,1000],['B',2,500]]};
const names={1:'A',2:'B',3:'C',4:'D',5:'E'};
const normalize=entries=>JSON.stringify(entries.map(e=>[e.recipient,e.level,e.amount]));
(async()=>{
 for(const order of permutations([['A',2],['B',3],['C',4],['E',1]]))await test('binding order '+order.map(([p,c])=>names[c]+'->'+p).join(','),async()=>{
  const h=backend({promoters:Object.entries(names).map(([id,code])=>({user_id:Number(id),code,status:'active'}))});
  for(const [code,id]of order){const r=await h.call(code,id);assert.equal(r.http,200);assert.equal(r.body.data.status,'bound');}
  for(const buyer of [2,3,4]){
   assert.equal(normalize(await accrue(h.rows,buyer)),JSON.stringify(expected[buyer]));
   const rows=h.rows.filter(r=>r.child===buyer).sort((a,b)=>a.level-b.level);
   assert.equal(JSON.stringify(rows.map(r=>[names[r.parent],r.level])),JSON.stringify(expected[buyer].map(e=>e.slice(0,2))));
  }
  const before=JSON.stringify(h.rows);assert.equal((await h.call('E',1)).body.data.status,'already_bound');assert.equal(JSON.stringify(h.rows),before);
 });
 await test('stale second-level cache is not used for new commission',async()=>{
  const rows=[{parent:5,child:1,level:1},{parent:1,child:2,level:1},{parent:4,child:2,level:2}];
  assert.equal(normalize(await accrue(rows,2)),JSON.stringify(expected[2]));
 });
 console.log(JSON.stringify({scope:'Binding-order permutations and stale cache; actual routes/helpers with mocked DB; no real payment',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
