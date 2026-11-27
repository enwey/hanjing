import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { checkWechatText, rejectUncheckedContent } from '../../hanjing-clinic-backend/wechatContentSecurity.js';

test('微信接口明确通过才放行，过期令牌刷新一次，失败关闭', async (t) => {
  const oldAppId = process.env.WX_MINI_APP_ID;
  const oldSecret = process.env.WX_MINI_APP_SECRET;
  process.env.WX_MINI_APP_ID = 'test-app';
  process.env.WX_MINI_APP_SECRET = 'test-secret';
  t.after(() => {
    if (oldAppId === undefined) delete process.env.WX_MINI_APP_ID;
    else process.env.WX_MINI_APP_ID = oldAppId;
    if (oldSecret === undefined) delete process.env.WX_MINI_APP_SECRET;
    else process.env.WX_MINI_APP_SECRET = oldSecret;
  });

  const tokenRefreshes = [];
  const checks = [];
  let replies = [];
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).endsWith('/stable_token')) {
      tokenRefreshes.push(body.force_refresh);
      return Response.json({ access_token: 'token-' + tokenRefreshes.length, expires_in: 7200 });
    }
    checks.push({ url: String(url), body });
    const res = replies.shift();
    if (res instanceof Error) throw res;
    return Response.json(res);
  });

  const request = { openid: 'wechat-user', scene: 2, content: '原始文本 <&>' };
  replies = [{ errcode: 42001 }, { errcode: 0, result: { suggest: 'pass' } }];
  assert.equal(await checkWechatText(request), 'pass');
  assert.deepEqual(tokenRefreshes, [false, true]);
  assert.deepEqual(checks[0].body, { ...request, version: 2 });
  assert.equal(new URL(checks[1].url).searchParams.get('access_token'), 'token-2');

  for (const suggest of ['risky', 'review', 'unknown']) {
    replies = [{ errcode: 0, result: { suggest } }];
    assert.equal(await checkWechatText(request), suggest === 'unknown' ? 'unavailable' : 'blocked');
  }
  replies = [{ errcode: 0 }, new Error('network'), { errcode: 87014 }];
  // Explicit legacy violation and service errors are verified independently below.
  assert.equal(await checkWechatText(request), 'unavailable');
  assert.equal(await checkWechatText(request), 'unavailable');
  assert.equal(await checkWechatText(request), 'blocked');
  const count = checks.length;
  assert.equal(await checkWechatText({ ...request, openid: '' }), 'unavailable');
  assert.equal(checks.length, count);
});

const clientRoutes = readFileSync(new URL('../../hanjing-clinic-backend/routes/client.js', import.meta.url), 'utf8');
const commentRoute = clientRoutes.slice(clientRoutes.indexOf('// POST /api/v1/community/posts/:id/comment'));
const routeSource = commentRoute.slice(0, commentRoute.indexOf('\n});') + 4);

for (const [decision, status] of [['pass', 200], ['blocked', 422], ['unavailable', 503]]) {
  test('回复在检测结果为 ' + decision + ' 时按预期处理', async () => {
    const writes = [];
    let handler;
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json() {} };
    runInNewContext(routeSource, {
      app: { post: (_path, _authenticate, callback) => { handler = callback; } },
      authenticateWxToken() {},
      escapeHtml: value => value.replaceAll('<', '&lt;'),
      checkSensitiveWords: () => false,
      publicAvatar: () => '',
      get: async sql => {
        if (sql.includes('FROM community_posts')) return { id: 3, user_id: 4, title: '门店' };
        if (sql.includes('FROM post_comments')) return { id: 2, post_id: 3, user_id: 5 };
        return { id: 1, openid: 'real-openid', nickname: '用户' };
      },
      checkWechatText: async ({ openid, scene, content }) => {
        assert.equal(openid, 'real-openid');
        assert.equal(scene, 2);
        assert.equal(content, '<原始文本');
        return decision;
      },
      rejectUncheckedContent,
      transaction: operation => operation({
        execute: async (sql, params) => {
          writes.push(sql);
          if (sql.includes('INSERT')) {
            assert.equal(params[2], 2);
            assert.equal(params[3], '&lt;原始文本');
          }
          return [{ insertId: 6 }];
        }
      }),
      writeNotification: async () => { writes.push('notification'); },
      console
    });

    await handler({ params: { id: '3' }, body: { content: ' <原始文本 ', parentId: 2 }, user: { id: 1 } }, res);
    assert.equal(res.statusCode, status);
    assert.equal(writes.length, decision === 'pass' ? 4 : 0);
  });
}


test('小程序发布入口使用统一提示，忽略内容检测错误中的内部信息', async () => {
  const apiSource = readFileSync(new URL('../../mp-weixin-rewrite/api/modules/community-api.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  let code;
  runInNewContext(apiSource, {
    module,
    require: () => ({ request: async () => { throw Object.assign(new Error('internal'), { data: { code } }); } })
  });
  for (const method of ['createCommunityPost', 'updateCommunityPost', 'commentCommunityPost']) {
    code = 'CONTENT_REJECTED';
    await assert.rejects(module.exports[method]('1'), { message: '发布内容包含违规信息，请修改后重试' });
    code = 'CONTENT_CHECK_UNAVAILABLE';
    await assert.rejects(module.exports[method]('1'), { message: '暂时无法发布，请稍后重试' });
  }
});
