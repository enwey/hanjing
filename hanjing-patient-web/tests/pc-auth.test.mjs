import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../hanjing-clinic-backend/package.json', import.meta.url),
);
const express = require('express'),
  jwt = require('jsonwebtoken');
const secret = 'pc-auth-isolated-test-secret-not-a-production-key';
let users = [],
  updated = 0;
mock.module('../../hanjing-clinic-backend/db.js', {
  namedExports: {
    query: async (sql, [unionid]) =>
      users.filter((u) => u.unionid === unionid).slice(0, 2),
    transaction: async (fn) =>
      fn({
        execute: async (sql, args) => {
          if (sql.startsWith('SELECT'))
            return [
              users.filter(
                (u) =>
                  u.unionid === args[0] || String(u.id) === String(args[1]),
              ),
            ];
          if (sql.startsWith('UPDATE')) {
            users.find((u) => String(u.id) === String(args[1])).unionid =
              args[0];
            updated++;
            return [{ affectedRows: 1 }];
          }
          throw Error('Unexpected SQL');
        },
      }),
  },
});
mock.module('../../hanjing-clinic-backend/helpers.js', {
  namedExports: {
    JWT_SECRET: secret,
    authenticateWxToken: (req, res, next) => {
      if (req.headers.authorization !== 'Bearer isolated-test-token')
        return res.status(401).json({ code: 401 });
      req.user = { id: 2, openid: 'mini-2' };
      next();
    },
  },
});
const { default: router } = await import(
  '../../hanjing-clinic-backend/routes/pc-auth.js'
);
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'api.weixin.qq.com') return realFetch(url, options);
  if (parsed.pathname.endsWith('access_token'))
    return new Response(
      JSON.stringify({
        openid: 'website-openid',
        unionid: 'union-1',
        access_token: 'wx-test',
      }),
    );
  return new Response(
    JSON.stringify({ openid: 'website-openid', unionid: 'union-1' }),
  );
};
const app = express();
app.use(express.json());
app.use(router);
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const endpoint =
  'http://127.0.0.1:' + server.address().port + '/api/v1/pc/auth/wechat';
const old = {
  PC_WEB_ORIGIN: process.env.PC_WEB_ORIGIN,
  WECHAT_WEB_APP_ID: process.env.WECHAT_WEB_APP_ID,
  WECHAT_WEB_APP_SECRET: process.env.WECHAT_WEB_APP_SECRET,
};
const origin = 'https://patient.example.test';
const call = (name, data = {}, headers = {}) =>
  realFetch(endpoint + '/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(data),
  });
const start = async () => {
  const res = await call('start');
  const body = await res.json();
  return {
    state: new URL(body.data.authorizeUrl).searchParams.get('state'),
    cookie: res.headers.getSetCookie()[0].split(';')[0],
    res,
    body,
  };
};
test('PC WeChat HTTP handlers: isolated identity, state, origin and binding', async (t) => {
  try {
    delete process.env.PC_WEB_ORIGIN;
    delete process.env.WECHAT_WEB_APP_ID;
    delete process.env.WECHAT_WEB_APP_SECRET;
    await t.test('missing config fails closed', async () =>
      assert.equal((await call('start')).status, 503),
    );
    process.env.PC_WEB_ORIGIN = origin;
    process.env.WECHAT_WEB_APP_ID = 'website-test-app';
    process.env.WECHAT_WEB_APP_SECRET = 'test-only';
    await t.test('untrusted origin forbidden', async () =>
      assert.equal(
        (await call('start', {}, { Origin: 'https://evil.test' })).status,
        403,
      ),
    );
    let login = await start();
    await t.test('state is bounded and secure cookie is HttpOnly', () => {
      assert.equal(login.state.length, 64);
      assert.match(
        login.res.headers.getSetCookie()[0],
        /HttpOnly; SameSite=Lax/,
      );
      assert.match(login.res.headers.getSetCookie()[0], /Secure/);
      assert.match(login.body.data.authorizeUrl, /scope=snsapi_login/);
    });
    await t.test('state tampering rejected', async () =>
      assert.equal(
        (
          await call(
            'exchange',
            { code: 'test', state: 'f'.repeat(64) },
            { Cookie: login.cookie },
          )
        ).status,
        401,
      ),
    );
    await t.test('unicode malformed state rejected without 500', async () =>
      assert.equal(
        (
          await call(
            'exchange',
            { code: 'test', state: '界'.repeat(64) },
            { Cookie: login.cookie },
          )
        ).status,
        400,
      ),
    );
    users = [{ id: 1, openid: 'mini-1', unionid: 'union-1' }];
    await t.test(
      'existing unionid issues patient JWT with mini openid',
      async () => {
        const r = await call(
          'exchange',
          { code: 'test', state: login.state },
          { Cookie: login.cookie },
        );
        assert.equal(r.status, 200);
        const token = (await r.json()).data.access_token;
        const body = jwt.verify(token, secret);
        assert.equal(body.id, 1);
        assert.equal(body.openid, 'mini-1');
        assert.equal(updated, 0);
      },
    );
    users = [
      { id: 1, openid: 'mini-1', unionid: 'union-1' },
      { id: 3, openid: 'mini-3', unionid: 'union-1' },
    ];
    login = await start();
    await t.test(
      'ambiguous unionid refuses automatic account selection',
      async () =>
        assert.equal(
          (
            await call(
              'exchange',
              { code: 'test', state: login.state },
              { Cookie: login.cookie },
            )
          ).status,
          409,
        ),
    );
    users = [{ id: 2, openid: 'mini-2', unionid: null }];
    login = await start();
    const exchanged = await call(
      'exchange',
      { code: 'test', state: login.state },
      { Cookie: login.cookie },
    );
    const ticket = exchanged.headers
      .getSetCookie()
      .find((c) => c.startsWith('pc_wechat_bind='))
      .split(';')[0];
    await t.test(
      'unknown unionid requires explicit existing patient login',
      async () => {
        assert.equal((await exchanged.json()).data.bindingRequired, true);
        assert.equal(users.length, 1);
      },
    );
    await t.test('anonymous binding rejected', async () =>
      assert.equal(
        (await call('bind', { confirm: true }, { Cookie: ticket })).status,
        401,
      ),
    );
    await t.test('binding requires explicit confirmation', async () =>
      assert.equal(
        (
          await call(
            'bind',
            {},
            { Cookie: ticket, Authorization: 'Bearer isolated-test-token' },
          )
        ).status,
        400,
      ),
    );
    await t.test(
      'authenticated confirmed binding preserves mini openid',
      async () => {
        assert.equal(
          (
            await call(
              'bind',
              { confirm: true },
              { Cookie: ticket, Authorization: 'Bearer isolated-test-token' },
            )
          ).status,
          200,
        );
        assert.equal(users[0].unionid, 'union-1');
        assert.equal(users[0].openid, 'mini-2');
        assert.equal(updated, 1);
      },
    );
    users.push({ id: 3, openid: 'mini-3', unionid: 'union-1' });
    await t.test('conflicting identity is never merged', async () =>
      assert.equal(
        (
          await call(
            'bind',
            { confirm: true },
            { Cookie: ticket, Authorization: 'Bearer isolated-test-token' },
          )
        ).status,
        409,
      ),
    );
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((r) => server.close(r));
  }
});
