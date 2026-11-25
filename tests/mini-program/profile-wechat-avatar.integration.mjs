import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';

const password = process.env.TEST_DB_PASSWORD ?? JSON.parse(
  execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8' })
)[0].Config.Env.find(line => line.startsWith('MYSQL_ROOT_PASSWORD='))?.slice('MYSQL_ROOT_PASSWORD='.length);
const schema = 'hanjing_test_profile_avatar_' + Date.now();
const control = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password });
const cwd = process.cwd();
const tempDir = await mkdtemp(join(tmpdir(), 'profile-avatar-'));
const http = globalThis.fetch;
let created, db, server;

try {
  await control.query('CREATE DATABASE ' + schema);
  created = true;
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root', DB_PASSWORD: password, DB_NAME: schema,
    NODE_ENV: 'test', JWT_SECRET: randomBytes(48).toString('hex'), PII_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
    WX_MINI_APP_ID: 'fixture-app', WX_MINI_APP_SECRET: 'fixture-secret',
  });
  globalThis.fetch = async (url, options) => {
    const upstream = new URL(url);
    assert.equal(upstream.hostname, 'api.weixin.qq.com');
    if (upstream.pathname === '/sns/jscode2session') {
      return Response.json({ openid: 'avatar-user-' + upstream.searchParams.get('js_code') });
    }
    if (upstream.pathname === '/cgi-bin/stable_token') {
      return Response.json({ access_token: 'fixture-token', expires_in: 7200 });
    }
    if (upstream.pathname === '/wxa/business/getuserphonenumber') {
      const { code } = JSON.parse(options.body);
      return Response.json({ errcode: 0, phone_info: { purePhoneNumber: '1380000910' + code } });
    }
    throw new Error('Unexpected upstream call');
  };
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  process.chdir(tempDir);
  const router = (await import('../../hanjing-clinic-backend/routes/client.js')).default;
  const app = express();
  app.use(express.json());
  app.use(router);
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  async function call(path, { method = 'GET', token, data } = {}) {
    const json = data && !(data instanceof FormData);
    return http('http://127.0.0.1:' + server.address().port + path, {
      method, headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      },
      body: json ? JSON.stringify(data) : data,
      signal: AbortSignal.timeout(15000),
    });
  }
  async function ok(path, options) {
    const response = await call(path, options);
    const body = await response.json();
    assert.equal(response.status, 200, body.message);
    assert.equal(body.code, 0, body.message);
    return body.data;
  }
  async function login(code) {
    const account = await ok('/api/v1/auth/wx-login', { method: 'POST', data: { code, phoneCode: code } });
    return account.access_token;
  }

  const token = await login('1');
  const upload = new FormData();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=', 'base64');
  upload.append('file', new Blob([image], { type: 'image/png' }), 'avatar.png');
  const { url } = await ok('/api/v1/user/upload?ext=png', { method: 'POST', token, data: upload });
  const [storedPath] = url.split('?');
  assert.match(storedPath, /^\/uploads\/medical-attachments\/[\w-]+\.png$/);
  assert.ok(url.length > 255, 'fixture must reproduce a signed URL beyond VARCHAR(255)');

  const profilePath = '/api/v1/user/profile';
  const saved = await ok(profilePath, { method: 'PUT', token, data: { avatar: url, nickname: '头像自测' } });
  assert.ok(saved.avatar.startsWith(storedPath + '?asset_token='));
  const row = () => db.get('SELECT avatar_url FROM users WHERE openid = ?', ['avatar-user-1']);
  assert.equal((await row()).avatar_url, storedPath);
  console.log('PASS multipart upload and signed URL save into MySQL');

  const updated = await ok(profilePath, { method: 'PUT', token, data: { nickname: '只改昵称' } });
  assert.ok(updated.avatar.startsWith(storedPath + '?asset_token='));
  assert.equal((await row()).avatar_url, storedPath);
  const profile = await ok(profilePath, { token });
  assert.equal(profile.nickname, '只改昵称');
  const file = await call(profile.avatar);
  assert.equal(file.status, 200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), image);
  assert.equal((await call(storedPath)).status, 403);
  console.log('PASS nickname-only update preserves avatar, signed image loads on profile reopen');

  const otherToken = await login('2');
  assert.equal((await call(profilePath, { method: 'PUT', token: otherToken, data: { avatarUrl: url } })).status, 403);
  assert.equal((await call(profilePath, {
    method: 'PUT', token, data: { avatar: 'https://example.invalid/' + 'a'.repeat(256) },
  })).status, 400);
  assert.equal((await row()).avatar_url, storedPath);
  console.log('PASS other account and oversized external URL are rejected');

  let page;
  let submitted;
  const loadingEvents = [];
  const pageUpdates = [];
  const origin = 'http://127.0.0.1:' + server.address().port;
  const pageApi = {
    uploadLocalFile: async () => ({ data: { url: origin + url } }),
    updateUserProfile: async data => {
      submitted = data;
      return ok(profilePath, { method: 'PUT', token, data });
    },
    getUserProfile: () => ok(profilePath, { token }),
  };
  const pageSource = await readFile(new URL('../../mp-weixin-rewrite/pages/profile/settings/personal-info/index.js', import.meta.url), 'utf8');
  runInNewContext(pageSource, {
    Page: config => { page = config; },
    require: file => ({
      '../../../../api/index': pageApi,
      '../../../../stores/session-store': { state: {} },
      '../../../../common/utils/image-url': { normalizeImageUrl: value => value || '' },
    })[file],
    wx: { showLoading: () => loadingEvents.push('show'), hideLoading: () => loadingEvents.push('hide'), showToast() {} },
  });
  page.setData = updates => {
    pageUpdates.push(updates);
    Object.assign(page.data, updates);
  };
  await page.loadProfile();
  await page.handleChooseAvatar({ detail: { avatarUrl: 'wxfile://avatar.png' } });
  pageUpdates.length = 0;
  await page.saveProfile();
  assert.equal(submitted.avatar, storedPath);
  assert.equal(page.data.pendingAvatarPath, '');
  assert.ok(page.data.avatarUrl.startsWith(storedPath + '?asset_token='));
  assert.deepEqual(loadingEvents, ['show', 'hide']);
  assert.ok(pageUpdates.every(update => !update.loading));
  console.log('PASS personal-info page strips the signature before PUT and reloads the saved image');
} finally {
  globalThis.fetch = http;
  process.chdir(cwd);
  if (server) await new Promise(resolve => server.close(resolve));
  await db?.closePool();
  if (created) await control.query('DROP DATABASE ' + schema);
  await control.end();
  await rm(tempDir, { recursive: true, force: true });
}
