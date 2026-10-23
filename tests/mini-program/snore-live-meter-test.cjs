const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// 1. Setup mock environment using assessment.cjs harness
const helperSource = fs.readFileSync(__dirname + '/assessment.cjs', 'utf8');
const box = { require, __dirname, module: { exports: {} } };
vm.runInNewContext(helperSource.slice(0, helperSource.indexOf('\n(async()=>{')) + '\nmodule.exports={setup};', box);
const { setup } = box.module.exports;

// Helper to create synthetic PCM
function makePcmBuffer(amplitude, length = 1024) {
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    pcm[i] = Math.round(amplitude * Math.sin(2 * Math.PI * 200 * i / 8000));
  }
  return pcm.buffer;
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

// Test 1: Initial state
check('Initial live decibel state is --', () => {
  const h = setup('recording/index');
  assert.equal(h.p.data.currentDecibel, '--');
  assert.equal(h.p.data.peakLiveDecibel, '--');
});

// Test 2: Frame with quiet background noise (RMS ~30, amplitude ~42)
check('Quiet frame (~30 RMS) produces ~35 dB SPL', () => {
  const h = setup('recording/index');
  h.p.bindRecorderEvents();
  // amplitude 42 on sine has RMS ~ 30
  const buf = makePcmBuffer(42);
  h.callbacks.frame[0]({ frameBuffer: buf });
  assert.equal(h.p.data.currentDecibel, 35);
  assert.equal(h.p.data.peakLiveDecibel, 35);
});

// Test 3: Frame with loud sound / playback (~70 dB, RMS ~1600, amplitude ~2262)
check('Loud playback frame (~1600 RMS) produces ~70 dB SPL and updates peak', () => {
  const h = setup('recording/index');
  h.p.bindRecorderEvents();
  const quietBuf = makePcmBuffer(42);
  h.callbacks.frame[0]({ frameBuffer: quietBuf });
  assert.equal(h.p.data.currentDecibel, 35);

  const loudBuf = makePcmBuffer(2262); // RMS = 2262 / sqrt(2) ≈ 1600
  h.callbacks.frame[0]({ frameBuffer: loudBuf });
  assert.equal(h.p.data.currentDecibel, 70);
  assert.equal(h.p.data.peakLiveDecibel, 70);
});

// Test 4: Peak retention when volume drops
check('Peak decibel is retained when subsequent frame is quieter', () => {
  const h = setup('recording/index');
  h.p.bindRecorderEvents();
  const loudBuf = makePcmBuffer(2262);
  h.callbacks.frame[0]({ frameBuffer: loudBuf });
  assert.equal(h.p.data.currentDecibel, 70);
  assert.equal(h.p.data.peakLiveDecibel, 70);

  // Quieter frame (amplitude ~212, RMS ~150 -> 49 dB)
  const quietBuf = makePcmBuffer(212);
  h.callbacks.frame[0]({ frameBuffer: quietBuf });
  assert.equal(h.p.data.currentDecibel, 49);
  assert.equal(h.p.data.peakLiveDecibel, 70, 'Peak must be retained as 70');
});

// Test 5: Pausing retains current decibel values
check('Pausing recording retains decibel readings', () => {
  const h = setup('recording/index');
  h.p.bindRecorderEvents();
  const loudBuf = makePcmBuffer(2262);
  h.callbacks.frame[0]({ frameBuffer: loudBuf });
  h.p.pauseRecording();
  assert.equal(h.p.data.hasRecordingEnded, true);
  assert.equal(h.p.data.currentDecibel, 70);
  assert.equal(h.p.data.peakLiveDecibel, 70);
});

// Test 6: Resetting stopped recording clears decibel readings
check('resetStoppedRecording resets decibel readings to --', () => {
  const h = setup('recording/index');
  h.p.bindRecorderEvents();
  const loudBuf = makePcmBuffer(2262);
  h.callbacks.frame[0]({ frameBuffer: loudBuf });
  assert.equal(h.p.data.currentDecibel, 70);

  h.p.resetStoppedRecording();
  assert.equal(h.p.data.currentDecibel, '--');
  assert.equal(h.p.data.peakLiveDecibel, '--');
});

// Test 7: Template XML tag matching and syntax check
check('WXML and WXSS template check for live-decibel-meter', () => {
  const wxml = fs.readFileSync(__dirname + '/../../mp-weixin-rewrite/pages/assessment/recording/index.wxml', 'utf8');
  const wxss = fs.readFileSync(__dirname + '/../../mp-weixin-rewrite/pages/assessment/recording/index.wxss', 'utf8');
  assert.ok(wxml.includes('live-decibel-meter'), 'wxml must contain live-decibel-meter');
  assert.ok(wxml.includes('currentDecibel'), 'wxml must bind currentDecibel');
  assert.ok(wxml.includes('peakLiveDecibel'), 'wxml must bind peakLiveDecibel');
  assert.ok(wxss.includes('.live-decibel-meter.data-v-70350287'), 'wxss must style live-decibel-meter');
  assert.ok(wxss.includes('.meter-value.data-v-70350287'), 'wxss must style meter-value');
});

console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.status === 'PASS').length, results }, null, 2));
const hasFail = results.some(r => r.status === 'FAIL');
if (hasFail) {
  process.exit(1);
} else {
  console.log('ALL SNORE LIVE METER TESTS PASSED!');
}
