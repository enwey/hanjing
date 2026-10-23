const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/assessment.cjs', 'utf8');
const box = { require, __dirname, module: { exports: {} } };
vm.runInNewContext(source.slice(0, source.indexOf('\n(async()=>{')) + '\nmodule.exports={setup,gate};', box);
const { setup, gate } = box.module.exports, results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', actual: e.message }); }
}
const report = { id: 'old-private', snoreAnalysis: { riskLevel: 'normal', avgDecibel: 30, peakDecibel: 30, snoreRate: 0, apneaEvents: 0 } };
function recording(overrides = {}) {
  const h = setup('recording/index', { submitSnoreRecording: async () => ({ data: { id: 'saved-snore' } }), ...overrides });
  h.p.onLoad({});
  Object.assign(h.p.data, { recordingDurationSeconds: 5, selectedMemberId: '1', tempFilePath: 'synthetic.pcm', hasRecordingEnded: true, isSubmitting: true, isAnalyzing: true });
  h.wx.getFileSystemManager = () => ({ readFileSync: () => new ArrayBuffer(80000) });
  return h;
}
(async () => {
  await check('ASMT-12 snore response after logout must not render old private report', async () => {
    const d = gate(), h = setup('snore-result/index', { getAssessmentDetail: () => d.promise });
    h.p.onLoad({ id: 'old-private' }); const task = h.p.onShow(); h.setLogged(false);
    d.resolve({ data: report }); await task;
    assert.equal(h.p.data.reportDetail, null, 'old-private report rendered after logout');
  });
  await check('ASMT-12 older snore success must not overwrite newer unauthorized response', async () => {
    const d = gate(); let n = 0;
    const h = setup('snore-result/index', { getAssessmentDetail: () => ++n === 1 ? d.promise : Promise.reject(Object.assign(Error('unauthorized'), { statusCode: 401 })) });
    h.p.onLoad({ id: 'old-private' }); const first = h.p.onShow(); await h.p.onShow();
    d.resolve({ data: report }); await first;
    assert.equal(h.p.data.reportDetail, null, 'old success overwrote newer 401 and restored report');
  });
  await check('ASMT-13 failed stopped recording can start a fresh recording instead of resume', async () => {
    const h = recording({ submitSnoreRecording: async () => { throw Object.assign(Error('rejected'), { statusCode: 400 }); } });
    await h.p.submitRecording(); let starts = 0, resumes = 0;
    h.p.startRecording = () => starts++; h.p.resumeRecording = () => resumes++;
    h.p.onMicTap(); assert.equal(starts, 1, `fresh starts=${starts}, resumes of stopped recorder=${resumes}`);
  });
  await check('ASMT-14 saved snore redirect failure exits analyzing state', async () => {
    const h = recording(); await h.p.submitRecording();
    assert.equal(h.calls.length, 1); if (h.calls[0].fail) h.calls[0].fail({ errMsg: 'redirectTo:fail' });
    assert.equal(h.p.data.isAnalyzing, false, 'saved report redirect failed but analyzing remains true');
  });
  await check('ASMT-15 offline storage failure does not navigate to nonexistent local report', async () => {
    const h = recording({ submitSnoreRecording: async () => { throw Error('offline'); } });
    h.wx.setStorageSync = () => { throw Error('quota exceeded'); };
    await h.p.submitRecording();
    assert.equal(h.calls.length, 0, `redirects=${h.calls.length}; no report or pending queue persisted`);
  });
  await check('ASMT-16 repeated mic tap during authorization starts recorder only once', async () => {
    const h = setup('recording/index'); h.p.onLoad({}); await h.p.onShow(); const auth = []; let starts = 0;
    h.wx.authorize = o => auth.push(o); h.p.dimScreenForRecording = async () => {};
    h.recorder.start = () => starts++;
    h.p.onMicTap(); h.p.onMicTap(); for (const o of auth) await o.success();
    assert.equal(starts, 1, `recorder.start calls=${starts}`);
  });
  for (const page of ['questionnaire/index', 'recording/index']) {
    await check('ASMT-17 ' + page + ' reloads members when login generation changes', async () => {
      const h = setup(page); h.p.onLoad({}); await h.p.onShow(); h.setLogged(true);
      h.api.getFamilyMembers = async () => ({ data: [{ id: 'new-account-member', name: 'new', relation: 'self' }] });
      await h.p.onShow(); assert.equal(h.p.data.selectedMemberId, 'new-account-member', 'old account member remains selected');
    });
  }
  await check('snore 401 without older in-flight request clears report', async () => {
    const h = setup('snore-result/index', { getAssessmentDetail: async () => ({ data: report }) });
    h.p.onLoad({ id: report.id }); await h.p.onShow();
    h.api.getAssessmentDetail = async () => { throw Object.assign(Error('unauthorized'), { statusCode: 401 }); };
    await h.p.onShow(); assert.equal(h.p.data.reportDetail, null);
  });
  await check('normal synthetic recording saves server report and redirects by ID', async () => {
    const h = recording(); await h.p.submitRecording();
    assert.equal(h.calls[0].url, '/pages/assessment/snore-result/index?id=saved-snore');
  });
  await check('offline synthetic recording persists local report and pending upload', async () => {
    const h = recording({ submitSnoreRecording: async () => { throw Error('offline'); } });
    await h.p.submitRecording(); assert.equal(h.storage.pending_snore_uploads.length, 1);
    assert.equal(h.storage.last_local_snore_result.patientId, '1'); assert.match(h.calls[0].url, /id=local/);
  });
  console.log(JSON.stringify({ scope: 'actual page modules with mocked wx, API, session and synthetic PCM; no device or real data', total: results.length, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results }, null, 2));
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})();
