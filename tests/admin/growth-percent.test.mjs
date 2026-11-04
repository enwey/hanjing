import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../hanjing-clinic-backend/routes/admin.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('    const calculateTrend ='),source.indexOf('    // 5. Department distribution'));
for(const [current,previous,trend,type] of [[5,0,'+100%','up'],[0,0,'0%','neutral'],[0,5,'-100%','down'],[80,60,'+33%','up'],[60,80,'-25%','down'],[60,60,'0%','neutral']]) {
 test(`dashboard all metrics including visit rate: ${previous} to ${current}`,()=>{
  const ctx={appointments:current,prevAppointments:previous,revenue:current,prevRevenue:previous,newPatients:current,prevNewPatients:previous,visitRate:current,prevVisitRate:previous};
  const results=vm.runInNewContext(block+';[apptTrendInfo,revenueTrendInfo,patientTrendInfo,rateTrendInfo]',ctx);
  for(const result of results){assert.equal(result.trend,trend);assert.equal(result.trendType,type)}
 });
}
