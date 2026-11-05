const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('backend caches valid image, coalesces requests, regenerates lost/corrupt/environment-changed files', async () => {
  const { createInviteQrCache } = await import('../../hanjing-clinic-backend/distribution-invite-qr.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'invite-qr-'));
  let calls = 0, env = 'release', invalid = false;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=', 'base64');
  const getQr = createInviteQrCache({ root, getToken: async ({ signal }) => { assert.ok(signal); return 'token'; }, saveUrl: async () => {}, config: () => ({ appId: 'app', env }), fetchImage: async (_, options) => {
    calls++; assert.equal(JSON.parse(options.body).scene, 'inviteCode=HJ1'); assert.ok(options.signal);
    return { ok: true, arrayBuffer: async () => invalid ? Buffer.from('{"errcode":40001}') : png };
  }});
  const row = { id: 1, invite_code: 'HJ1' };
  try {
    const results = await Promise.all([getQr(row), getQr(row)]); assert.equal(calls, 1); assert.equal(results[0].url, results[1].url);
    await getQr(row); assert.equal(calls, 1);
    const file = path.join(root, path.basename(results[0].url));
    await fs.unlink(file); await getQr(row); assert.equal(calls, 2);
    await fs.writeFile(file, 'broken'); await getQr(row); assert.equal(calls, 3);
    env = 'trial'; const changed = await getQr(row); assert.equal(calls, 4); assert.notEqual(changed.url, results[0].url);
    env = 'develop'; invalid = true; assert.equal((await getQr(row)).url, '');
    invalid = false; assert.ok((await getQr(row)).url);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('invite service only requests invitation endpoint without forced regeneration', async () => {
  const source = await fs.readFile('mp-weixin-rewrite/pages/distribution/invite/invite-service.js', 'utf8');
  let calls = 0; const module = { exports: {} };
  vm.runInNewContext(source, { module, require: () => ({ getDistributionInviteInfo: async (...args) => { calls++; assert.equal(args.length, 0); return { data: { inviteCode: 'HJ1', inviteQrCode: 'https://host/qr.png' } }; }, getDistributorInfo: () => { throw Error('must not request'); } }) });
  const info = await module.exports.loadInviteShareInfo(); assert.equal(info.inviteCode, 'HJ1'); assert.equal(calls, 1);
});

test('page downloads with retry and reuses local QR; failed QR prevents poster export', async () => {
  const source = await fs.readFile('mp-weixin-rewrite/pages/distribution/invite/index.js', 'utf8');
  let config; const moduleMocks = { './qr-diagnostics': require('../../mp-weixin-rewrite/pages/distribution/invite/qr-diagnostics'), './invite-design': { copy: {} }, './invite-service': { loadInviteShareInfo: async () => ({ inviteCode: 'HJ1', inviteQrCode: 'https://host/qr.png' }) } };
  vm.runInNewContext(source, { require: name => moduleMocks[name] || {}, Page: p => config = p, wx: { showToast() {} } });
  const p = { ...config, data: { ...config.data }, setData(values) { Object.assign(this.data, values); } };
  let tries = 0; p.resolvePosterQrImage = async () => ++tries === 1 ? '' : '/local/qr.png';
  await p.loadInviteInfo(); assert.equal(tries, 2); assert.equal(p.data.inviteQrCode, '/local/qr.png');
  p.resolvePosterQrImage = async src => { assert.equal(src, '/local/qr.png'); return src; };
  await p.loadInviteInfo();
  p.data.inviteQrCode = ''; await assert.rejects(p.prepareInviteImage(), /小程序码/);
  p.data.inviteQrCode = '/local/qr.png'; p.getPosterCanvasContext = async () => ({ canvas: {}, context: {} }); p.loadPosterImage = async () => null; p.resolvePosterQrImage = async () => '/local/qr.png';
  await assert.rejects(p.drawInvitePoster(), /小程序码/);
});
