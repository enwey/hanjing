const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const code = fs.readFileSync(__dirname + '/../../mp-weixin-rewrite/pages/assessment/recording/index.js', 'utf8');
const ctx = { require: () => ({}), wx: { getRecorderManager: () => ({}) }, module: { exports: {} } };
vm.runInNewContext(code.slice(0, code.indexOf('Page({')) + '\nmodule.exports={analyzePcmOnClient,calculateFrameDecibel};', ctx);
const { analyzePcmOnClient, calculateFrameDecibel } = ctx.module.exports;

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

// Helper to create synthetic PCM audio
function makePcm(seconds, genSample) {
  const sampleRate = 8000;
  const length = sampleRate * seconds;
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    pcm[i] = genSample(i, i / sampleRate);
  }
  return pcm;
}

// Test 1: Continuous snoring audio with breathing cycle pulses (peak ~60-63dB, avg ~52-55dB)
check('Continuous snoring is accurately recognized with significant snoreRate and moderate risk', () => {
  const pcm = makePcm(12, (i, t) => {
    const cycleT = t % 3; // 3-second breathing cycle
    let amp = 100; // baseline ~45 dB
    if (cycleT < 2.2) {
      // Snore inhalation envelope: swells up to ~62 dB
      const env = Math.sin(Math.PI * cycleT / 2.2);
      amp += Math.round(750 * env);
    }
    const signal = Math.sin(2 * Math.PI * 125 * t) + 0.3 * Math.sin(2 * Math.PI * 250 * t);
    return Math.round(amp * signal);
  });
  const res = analyzePcmOnClient(pcm, 12);
  assert.ok(res.avgDecibel >= 48 && res.avgDecibel <= 58, `avgDecibel should be ~50-55dB, got ${res.avgDecibel}`);
  assert.ok(res.peakDecibel >= 60, `peakDecibel should be >= 60dB, got ${res.peakDecibel}`);
  assert.ok(res.snoreRate >= 60, `snoreRate for continuous snore should be >= 60%, got ${res.snoreRate}%`);
  assert.ok(res.riskScore >= 45, `riskScore should be in moderate range, got ${res.riskScore}`);
  assert.notEqual(res.riskLevel, 'normal', `riskLevel should not be normal, got ${res.riskLevel}`);
});

// Test 2: Silent room background noise (~35dB) produces 0% snoreRate and 0 score
check('Quiet room ambient noise produces 0% snoreRate and normal risk', () => {
  const pcm = makePcm(10, () => {
    return Math.round((Math.random() - 0.5) * 60);
  });
  const res = analyzePcmOnClient(pcm, 10);
  assert.equal(res.snoreRate, 0, `snoreRate should be 0, got ${res.snoreRate}`);
  assert.equal(res.riskScore, 0, `riskScore should be 0, got ${res.riskScore}`);
  assert.equal(res.riskLevel, 'normal');
});

// Test 3: Realistic ambient room noise (40-44dB, phone on desk, no snoring) MUST produce 0% snoreRate
check('Ambient room recording (40-44dB) without snoring produces 0% snoreRate', () => {
  const pcm = makePcm(10, (i, t) => {
    // Room hum + ambient noise around 42-44dB (no breath pulses)
    return Math.round((Math.random() - 0.5) * 160 + 50 * Math.sin(2 * Math.PI * 100 * t));
  });
  const res = analyzePcmOnClient(pcm, 10);
  assert.equal(res.snoreRate, 0, `Ambient room noise MUST NOT be detected as snore, got ${res.snoreRate}%`);
  assert.equal(res.riskScore, 0, `riskScore should be 0, got ${res.riskScore}`);
  assert.equal(res.riskLevel, 'normal');
});

// Test 4: Intermittent snore audio (4s snoring in 10s) produces proportional rate
check('Intermittent snore audio produces proportional snoreRate', () => {
  const pcm = makePcm(10, (i, t) => {
    if (t >= 3 && t < 7) {
      // 4 seconds of snore sound
      return Math.round(1600 * Math.sin(2 * Math.PI * 125 * t));
    }
    // 6 seconds of quiet background
    return Math.round((Math.random() - 0.5) * 50);
  });
  const res = analyzePcmOnClient(pcm, 10);
  assert.ok(res.snoreRate >= 35 && res.snoreRate <= 50, `snoreRate should be around 40%, got ${res.snoreRate}%`);
  assert.equal(res.apneaEvents, 0);
});

// Test 5: Flat high-frequency machine noise (electric fan) is rejected/penalized
check('Stationary high-frequency machine noise is not classified as severe snoring', () => {
  const pcm = makePcm(10, (i, t) => {
    return Math.round(230 * Math.sin(2 * Math.PI * 1800 * t));
  });
  const res = analyzePcmOnClient(pcm, 10);
  assert.ok(res.snoreRate <= 15, `High frequency noise should not have high snoreRate, got ${res.snoreRate}%`);
});

// Test 6: Simulated sleep apnea with two pauses >= 10s accurately detects 2 apnea events
check('Simulated sleep apnea with two pauses >= 10s accurately detects 2 apnea events', () => {
  // 45 seconds total:
  // 0-6s: snore (55dB)
  // 6-18s: pause 1 (12s quiet, 36-38dB)
  // 18-26s: snore (58dB)
  // 26-38s: pause 2 (12s quiet, 36-38dB)
  // 38-45s: snore recovery (56dB)
  const pcm = makePcm(45, (i, t) => {
    const isSnore = (t >= 0 && t < 6) || (t >= 18 && t < 26) || (t >= 38 && t < 45);
    if (isSnore) {
      return Math.round(800 * Math.sin(2 * Math.PI * 125 * t));
    }
    // Ambient noise fluctuating 36-38 dB in real room during pause
    return Math.round((Math.random() - 0.5) * 80);
  });
  const res = analyzePcmOnClient(pcm, 45);
  assert.equal(res.apneaEvents, 2, `Should detect exactly 2 apnea events, got ${res.apneaEvents}`);
  assert.ok(res.snoreRate > 0, `Snoring should be detected, got ${res.snoreRate}%`);
  assert.ok(res.riskScore >= 45, `Apnea events should significantly increase risk score, got ${res.riskScore}`);
});

// Test 7: Realistic nasal snoring (turbulent air friction ZC>760) with 2 pauses >= 10s accurately identifies snoring and 2 apnea events
check('Nasal snoring with turbulent harmonics and 2 pauses >= 10s detects both snore rate and 2 apnea events', () => {
  // 40 seconds total:
  // 0-10s: nasal snore (~67dB)
  // 10-20s: pause 1 (10s quiet room ~38dB)
  // 20-30s: nasal snore (~67dB)
  // 30-40s: pause 2 (10s quiet room ~38dB)
  const pcm = makePcm(40, (i, t) => {
    const isSnore = (t >= 0 && t < 10) || (t >= 20 && t < 30);
    if (isSnore) {
      return Math.round(1500 * Math.sin(2 * Math.PI * 300 * t) + 800 * Math.sin(2 * Math.PI * 850 * t) + (Math.random() - 0.5) * 500);
    }
    return Math.round((Math.random() - 0.5) * 80);
  });
  const res = analyzePcmOnClient(pcm, 40);
  assert.equal(res.apneaEvents, 2, `Should detect exactly 2 apnea events for nasal snore test, got ${res.apneaEvents}`);
  assert.ok(res.snoreRate >= 35 && res.snoreRate <= 60, `Nasal snoreRate should be 35~60%, got ${res.snoreRate}%`);
  assert.ok(res.riskScore >= 45, `Apnea events should produce moderate/severe risk score, got ${res.riskScore}`);
  assert.notEqual(res.riskLevel, 'normal');
});

console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.status === 'PASS').length, results }, null, 2));
const hasFail = results.some(r => r.status === 'FAIL');
if (hasFail) process.exit(1);
console.log('ALL CONTINUOUS SNORE TESTS PASSED!');
