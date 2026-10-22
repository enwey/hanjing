const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/assessment-round-02.cjs', 'utf8');
const box = { require, __dirname, module: { exports: {} } };
vm.runInNewContext(source.slice(0, source.indexOf('(async () => {')) + 'module.exports={recording,setup,gate};', box);
const { recording, setup, gate } = box.module.exports, results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', actual: e.message }); }
}
(async () => {
  await check('ASMT-14 saved report navigation retry never repeats POST', async () => {
    let n = 0; const h = recording({ submitSnoreRecording: async () => { n++; return { data: { id: 'saved' } }; } });
    await h.p.submitRecording(); h.calls[0].fail(); h.p.onMicTap();
    assert.equal(n, 1); assert.equal(h.calls.length, 2); assert.equal(h.calls[0].url, h.calls[1].url);
  });
  await check('ASMT-14 synchronous navigation failure also recovers', async () => {
    const h = recording(); h.wx.redirectTo = () => { throw Error('navigation unavailable'); };
    await h.p.submitRecording(); assert.equal(h.p.data.isAnalyzing, false); assert.ok(h.p._savedReportUrl);
  });
  await check('ASMT-15 remote success survives local cache quota failure', async () => {
    const h = recording(); h.wx.setStorageSync = () => { throw Error('quota'); };
    await h.p.submitRecording(); assert.equal(h.calls.length, 1); assert.match(h.calls[0].url, /saved-snore/);
  });
  await check('ASMT-16 rejected authorization allows later retry', async () => {
    const h = setup('recording/index'); h.p.onLoad({}); let n = 0;
    h.wx.authorize = o => { n++; o.fail(); }; await h.p.startRecording(); await h.p.startRecording();
    assert.equal(n, 2); assert.equal(h.p._starting, null);
  });
  await check('ASMT-16 authorization response after unload cannot start recorder', async () => {
    const h = setup('recording/index'); h.p.onLoad({}); let auth, n = 0;
    h.wx.authorize = o => auth = o; h.recorder.start = () => n++;
    await h.p.startRecording(); h.p.onUnload(); await auth.success(); assert.equal(n, 0);
  });
  for (const page of ['questionnaire/index', 'recording/index']) {
    await check('ASMT-17 late old-member response cannot overwrite new session: ' + page, async () => {
      const d = gate(); const h = setup(page, { getFamilyMembers: () => d.promise }); h.p.onLoad({});
      const first = h.p.onShow(); h.setLogged(true);
      h.api.getFamilyMembers = async () => ({ data: [{ id: 'new', relation: 'self', name: 'new' }] });
      await h.p.onShow(); d.resolve({ data: [{ id: 'old', relation: 'self', name: 'old' }] }); await first;
      assert.equal(h.p.data.selectedMemberId, 'new');
    });
  }
  await check('ASMT-12 report response after unload cannot write page state', async () => {
    const d = gate(), h = setup('snore-result/index', { getAssessmentDetail: () => d.promise });
    h.p.onLoad({ id: 'r' }); const task = h.p.onShow(); h.p.onUnload(); const writes = h.writes.length;
    d.resolve({ data: { id: 'r', snoreAnalysis: { riskLevel: 'normal' } } }); await task;
    assert.equal(h.writes.length, writes); assert.equal(h.p.data.reportDetail, null);
  });
  console.log(JSON.stringify({ scope: 'independent regression, actual modules with mocked wx/API/session', total: results.length, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results }, null, 2));
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})();
