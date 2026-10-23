const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const filePath = __dirname + '/../../mp-weixin-rewrite/pages/assessment/recording/index.js';
const src = fs.readFileSync(filePath, 'utf8');

const ctx = {
  require: () => ({}),
  wx: { getRecorderManager: () => ({}) },
  module: { exports: {} }
};

vm.runInNewContext(src.slice(0, src.indexOf('Page({')) + '\nmodule.exports={calculateFrameDecibel,analyzePcmOnClient};', ctx);
const { calculateFrameDecibel, analyzePcmOnClient } = ctx.module.exports;

// Test 1: Silent room background noise (RMS around 30) -> ~35 dB
const silentDb = calculateFrameDecibel(30);
assert.equal(silentDb, 35, `Silent room (RMS=30) should be 35 dB, got ${silentDb}`);

// Test 2: Sound playing / loud talking (RMS around 1600) -> ~70 dB
const loudDb = calculateFrameDecibel(1600);
assert.equal(loudDb, 70, `Sound playback (RMS=1600) should be 70 dB, got ${loudDb}`);

// Test 3: Whisper / soft sound (RMS around 150) -> ~49 dB
const softDb = calculateFrameDecibel(150);
assert.equal(softDb, 49, `Soft sound (RMS=150) should be 49 dB, got ${softDb}`);

// Test 4: Loud snore / audio (RMS around 5000) -> ~80 dB
const peakDb = calculateFrameDecibel(5000);
assert.equal(peakDb, 80, `Loud snore (RMS=5000) should be 80 dB, got ${peakDb}`);

// Test 5: Digital clipping / maximum full-scale -> 95 dB (clamped)
const maxDb = calculateFrameDecibel(32768);
assert.equal(maxDb, 95, `Full scale (RMS=32768) should be 95 dB, got ${maxDb}`);

// Test 6: Zero RMS / complete silence -> clamped to minimum 30 dB
const zeroDb = calculateFrameDecibel(0);
assert.equal(zeroDb, 30, `Zero RMS should clamp to minimum 30 dB, got ${zeroDb}`);

// Test 7: Simulated PCM recording with intermittent 70dB sounds
const sampleRate = 8000;
const durationSeconds = 10;
const pcm = new Int16Array(sampleRate * durationSeconds);

// Fill with background noise (RMS ~30, peak ~50)
for (let i = 0; i < pcm.length; i++) {
  pcm[i] = Math.round((Math.random() - 0.5) * 60);
}

// In seconds 3 to 7, inject 125 Hz snore audio at RMS ~1600 (peak ~2200)
for (let i = sampleRate * 3; i < sampleRate * 7; i++) {
  const t = i / sampleRate;
  pcm[i] += Math.round(2260 * Math.sin(2 * Math.PI * 125 * t));
}

const analysis = analyzePcmOnClient(pcm, durationSeconds);
assert.ok(analysis.peakDecibel >= 69 && analysis.peakDecibel <= 72, `Peak decibel should be ~70dB, got ${analysis.peakDecibel}`);
assert.ok(analysis.avgDecibel >= 45 && analysis.avgDecibel <= 55, `Avg decibel should be in 45~55dB range, got ${analysis.avgDecibel}`);
assert.ok(analysis.snoreRate > 0, `Snoring should be detected, got snoreRate=${analysis.snoreRate}%`);

console.log('ALL 7 SNORE DECIBEL CALIBRATION TESTS PASSED!');
console.log('Simulation result:', {
  avgDecibel: analysis.avgDecibel,
  peakDecibel: analysis.peakDecibel,
  snoreRate: analysis.snoreRate,
  apneaEvents: analysis.apneaEvents,
  riskLevel: analysis.riskLevel,
  riskScore: analysis.riskScore
});
