// Focused developer checks, not independent regression or real-device accuracy evidence.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(__dirname + '/../../mp-weixin-rewrite/pages/assessment/recording/index.js', 'utf8');
const ctx = { require: () => ({}), wx: { getRecorderManager: () => ({}) }, module: { exports: {} } };
vm.runInNewContext(src.slice(0, src.indexOf('Page({')) + '\nmodule.exports={analyzePcmOnClient,calculateFrameDecibel};', ctx);
const { analyzePcmOnClient: analyze, calculateFrameDecibel: level } = ctx.module.exports;
function signal(amp, frequency = 125, pulse = true) {
  return Int16Array.from({ length: 80000 }, (_, i) => Math.round(amp * Math.sin(2*Math.PI*frequency*i/8000) * (pulse ? Math.max(0, Math.sin(Math.PI*(i/8000 % 2))) : 1)));
}
const results = [];
function check(name, fn) { try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } }
check('amplitude doubling increases RMS and peak by approximately 6 dB', () => {
  const a=analyze(signal(1000),10), b=analyze(signal(2000),10);
  assert.ok(Math.abs(b.avgDecibel-a.avgDecibel-6)<=1);
  assert.ok(Math.abs(b.peakDecibel-a.peakDecibel-6)<=1);
});
check('weak and loud periodic low-frequency signals both detected', () => {
  const weak=analyze(signal(300),10), loud=analyze(signal(12000),10);
  assert.ok(weak.snoreRate>0); assert.ok(Math.abs(weak.snoreRate-loud.snoreRate)<=5);
  assert.equal(weak.riskScore,weak.snoreRate); assert.equal(weak.analysisVersion,2);
});
check('sample peak preserves brief transient without counting it as snoring', () => {
  const pcm=signal(1000,1800,false); pcm[1234]=30000;
  const result=analyze(pcm,10);
  assert.equal(result.peakDecibel,Math.round(level(30000))); assert.equal(result.snoreRate,0);
});
check('stationary low-frequency tone excluded', () => assert.equal(analyze(signal(3000,125,false),10).snoreRate,0));
check('high-frequency pulses excluded', () => assert.equal(analyze(signal(3000,1800),10).snoreRate,0));
check('silence rejected', () => assert.throws(()=>analyze(new Int16Array(80000),10),/信号过弱/));
check('DC-only input rejected', () => assert.throws(()=>analyze(new Int16Array(80000).fill(5000),10),/信号过弱/));
check('inaudibly weak signal rejected', () => assert.throws(()=>analyze(signal(1),10),/信号过弱/));
check('clipped signal rejected', () => assert.throws(()=>analyze(Int16Array.from({length:80000},(_,i)=>i%2?32767:-32768),10),/失真/));
check('inconsistent capture duration rejected', () => assert.throws(()=>analyze(signal(1000),30),/时长异常/));
check('recording callback displays responsive digital levels', () => {
  const source=fs.readFileSync(__dirname+'/assessment.cjs','utf8'), box={require,__dirname,module:{exports:{}}};
  vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'\nmodule.exports={setup};',box);
  const h=box.module.exports.setup('recording/index'); h.p.bindRecorderEvents();
  assert.equal(h.p.data.liveDecibel,'--');
  h.callbacks.frame[0]({frameBuffer:signal(300,125,false).slice(0,800).buffer});
  assert.equal(h.p.data.liveDecibel,'31');
  assert.equal(h.p.data.livePeakDecibel,'32');
  const weak=h.p.data.audioLevels[7]; assert.match(h.p.data.liveLevelText,/dB/);
  h.callbacks.frame[0]({frameBuffer:signal(12000,125,false).slice(0,800).buffer});
  assert.ok(h.p.data.audioLevels[7]>weak);
  h.callbacks.frame[0]({frameBuffer:new Int16Array(800).buffer});
  assert.equal(h.p.data.liveLevelText,'未检测到有效声音');
  assert.equal(h.p.data.liveDecibel,'30');
  assert.equal(h.p.data.livePeakDecibel,'30');
});
console.log(JSON.stringify({ scope:'synthetic PCM developer self-check only', results },null,2));
process.exitCode=results.some(r=>!r.pass)?1:0;
