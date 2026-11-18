// Execute the original failure assertions and related suites against current source.
// Keep all earlier regression/self-test evidence intact.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const out = path.join(__dirname, 'artifacts/login-session-regression-02-2026-11-18');
fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '../../mp-weixin-rewrite');
const files = ['stores/session-store.js', 'api/request.js', 'pages/profile/index.js'];
const hashes = () => Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex')]));
const evidence = { phase: 'second independent limited regression', startedAt: new Date().toISOString(),
  method: 'actual client modules; mocked WeChat, HTTP, storage and timing', sourceBefore: hashes(), suites: [] };
async function run(file, replacements = []) {
  const filename = path.join(__dirname, file);
  let source = fs.readFileSync(filename, 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const lines = [], localProcess = { env: { ...process.env, LOGIN_TEST_FILTER: '' }, exitCode: 0 };
  const log = (...args) => lines.push(args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  await vm.runInNewContext(source, {
    require: createRequire(filename), __dirname, module: { exports: {} }, Buffer,
    console: { log, error: log, warn: log }, process: localProcess,
    structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
  }, { filename });
  fs.writeFileSync(path.join(out, file + '.log'), lines.join('\n') + '\n');
  evidence.suites.push({ file, exitCode: localProcess.exitCode, lastLine: lines.at(-1) });
  console.log(`${localProcess.exitCode ? 'FAIL' : 'PASS'} ${file}: ${lines.at(-1)}`);
}
(async () => {
  await run('login-session-regression-2026-11-18.cjs', [[
    'artifacts/login-session-regression-2026-11-18', 'artifacts/login-session-regression-02-2026-11-18/session',
  ]]);
  await run('login-badges-fix-selftest-2026-11-18.cjs', [[
    'artifacts/login-badges-fix-selftest-2026-11-18', 'artifacts/login-session-regression-02-2026-11-18/badges',
  ]]);
  await run('login-comprehensive.cjs');
  const session = JSON.parse(fs.readFileSync(path.join(out, 'session/results.json'), 'utf8'));
  const badges = JSON.parse(fs.readFileSync(path.join(out, 'badges/results.json'), 'utf8'));
  const replayed = JSON.parse(fs.readFileSync(path.join(out, 'session/replayed/results.json'), 'utf8'));
  const independent = session.results.filter(r => !r.id.startsWith('REG-01 '));
  const log = fs.readFileSync(path.join(out, 'login-comprehensive.cjs.log'), 'utf8');
  const counts = log.match(/TOTAL (\d+) PASS (\d+) FAIL (\d+)/);
  if (!counts) throw Error('Missing historical suite totals');
  const checks = [...independent, ...badges.results, ...replayed.results];
  evidence.passed = Number(counts[2]) + checks.filter(r => r.result === 'passed').length;
  evidence.failed = Number(counts[3]) + checks.filter(r => r.result === 'failed').length;
  evidence.total = Number(counts[1]) + checks.length;
  evidence.originalFailures = independent.filter(r => /^REG-0[89] /.test(r.id));
  evidence.sourceAfter = hashes();
  evidence.sourceStable = JSON.stringify(evidence.sourceBefore) === JSON.stringify(evidence.sourceAfter);
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ total: evidence.total, passed: evidence.passed, failed: evidence.failed, sourceStable: evidence.sourceStable }));
  process.exitCode = evidence.failed || evidence.suites.some(s => s.exitCode) || !evidence.sourceStable ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
