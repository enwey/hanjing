import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { checkWechatText, checkWechatImage, WECHAT_IMAGE_MAX_BYTES, rejectUncheckedContent } from '../../hanjing-clinic-backend/wechatContentSecurity.js';

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

const profileMarkerStart = '// 3. User Profile (PUT)';
const profileMarkerEnd = '// 3.1 Account Security (GET)';
const profileRouteSource = clientRoutes.slice(
  clientRoutes.indexOf(profileMarkerStart),
  clientRoutes.indexOf(profileMarkerEnd)
);

for (const [scenario, decision, expectedStatus, expectedCheckCalls] of [
  ['通过', 'pass', 200, 1],
  ['拦截', 'blocked', 422, 1],
  ['服务异常', 'unavailable', 503, 1],
  ['未改昵称跳过检测', 'pass', 200, 0]
]) {
  test('个人资料昵称修改在 ' + scenario + ' 时按预期处理', async () => {
    const writes = [];
    let checkCalls = 0;
    let handler;
    const res = { statusCode: 200, body: null, status(v) { this.statusCode = v; return this; }, json(b) { this.body = b; } };
    const existingNickname = scenario === '未改昵称跳过检测' ? '新昵称' : '微信用户1234';
    runInNewContext(profileRouteSource, {
      app: { put: (_path, _auth, cb) => { handler = cb; } },
      authenticateWxToken() {},
      escapeHtml: v => String(v).replaceAll('<', '&lt;'),
      encryptPII: v => 'enc:' + v,
      decryptPII: v => String(v || '').replace(/^enc:/, ''),
      normalizeFamilyBirthday: v => v,
      calculateAgeFromBirthday: () => 30,
      privateUploadPath: () => null,
      canReadPrivateUpload: async () => true,
      checkSensitiveWords: v => String(v || '').includes('违规词'),
      publicAvatar: v => v || '',
      formatDate: v => String(v || ''),
      getSelfPatientForUser: async () => ({ id: 10, gender: 1, age: 30, id_card: '' }),
      getSelfPatientForUserWithConn: async () => ({ id: 10, id_card: '', phone: '' }),
      createDefaultSelfPatientForUser: async () => ({ id: 10 }),
      autoBindExactIdentityPatientWithConn: async () => null,
      getPatientRecordNo: () => 'P010',
      getCurrentUserMembership: async () => ({ level: 'normal' }),
      get: async sql => {
        if (sql.includes('SELECT openid, nickname, community_nickname FROM users')) {
          return { id: 1, openid: 'real-openid', nickname: existingNickname };
        }
        return { id: 1, openid: 'real-openid', nickname: '新昵称', phone: 'enc:13800000000', avatar_url: '' };
      },
      checkWechatText: async ({ openid, scene, content }) => {
        checkCalls += 1;
        assert.equal(openid, 'real-openid');
        assert.equal(scene, 1);
        assert.equal(content, '新昵称');
        return decision;
      },
      rejectUncheckedContent,
      transaction: operation => operation({
        execute: async sql => {
          writes.push(sql);
          if (sql.includes('SELECT * FROM users')) return [[{ id: 1, phone_verified_at: '2026-01-01', nickname: '新昵称' }]];
          return [[]];
        }
      })
    });

    await handler({ body: { nickname: ' 新昵称 ' }, user: { id: 1 } }, res);
    assert.equal(res.statusCode, expectedStatus);
    assert.equal(checkCalls, expectedCheckCalls);
    assert.equal(writes.some(sql => sql.includes('UPDATE users')), expectedStatus === 200);
  });
}

test('个人资料昵称触发本地敏感词时同样拦截且不写库', async () => {
  const writes = [];
  let handler;
  const res = { statusCode: 200, body: null, status(v) { this.statusCode = v; return this; }, json(b) { this.body = b; } };
  runInNewContext(profileRouteSource, {
    app: { put: (_path, _auth, cb) => { handler = cb; } },
    authenticateWxToken() {},
    escapeHtml: v => String(v),
    encryptPII: v => v,
    decryptPII: v => v,
    normalizeFamilyBirthday: v => v,
    calculateAgeFromBirthday: () => 30,
    privateUploadPath: () => null,
    canReadPrivateUpload: async () => true,
    checkSensitiveWords: v => String(v || '').includes('加微信'),
    publicAvatar: v => v || '',
    formatDate: v => String(v || ''),
    getSelfPatientForUser: async () => ({ id: 10 }),
    getSelfPatientForUserWithConn: async () => ({ id: 10 }),
    createDefaultSelfPatientForUser: async () => ({ id: 10 }),
    autoBindExactIdentityPatientWithConn: async () => null,
    getPatientRecordNo: () => 'P010',
    getCurrentUserMembership: async () => ({ level: 'normal' }),
    get: async () => ({ id: 1, openid: 'real-openid', nickname: '微信用户1234' }),
    checkWechatText: async () => 'pass',
    rejectUncheckedContent,
    transaction: async () => { writes.push('tx'); }
  });

  await handler({ body: { nickname: '加微信联系' }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'CONTENT_REJECTED');
  assert.equal(writes.length, 0);
});

test('request 模块对内容安全错误码输出固定提示并忽略内部消息', async () => {
  const requestSource = readFileSync(new URL('../../mp-weixin-rewrite/api/request.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  let mockStatus = 422;
  let mockData = { code: 'CONTENT_REJECTED', message: 'internal detail' };
  runInNewContext(requestSource, {
    module,
    exports: module.exports,
    require: id => {
      if (id.endsWith('asset-url')) return { normalizeAssets: d => d };
      if (id.endsWith('env')) return { getApiBaseUrl: () => 'https://example.invalid/api/v1', getApiBaseUrls: () => ['https://example.invalid/api/v1'] };
      if (id.endsWith('mini-log')) return { createTraceId: () => 't1', report() {}, reportNow() {} };
      return {};
    },
    wx: {
      getStorageSync: () => '',
      removeStorageSync() {},
      request: ({ success }) => success({ statusCode: mockStatus, data: mockData })
    }
  });

  await assert.rejects(module.exports.request({ url: '/user/profile', method: 'PUT' }), {
    message: '发布内容包含违规信息，请修改后重试'
  });

  mockStatus = 503;
  mockData = { code: 'CONTENT_CHECK_UNAVAILABLE', message: 'secret trace' };
  await assert.rejects(module.exports.request({ url: '/user/profile', method: 'PUT' }), {
    message: '暂时无法发布，请稍后重试'
  });

  mockStatus = 400;
  mockData = { code: 400, message: '昵称格式无效' };
  await assert.rejects(module.exports.request({ url: '/user/profile', method: 'PUT' }), {
    message: '昵称格式无效'
  });
});

test('社区评论举报与作者软删除帖子/评论接口校验及占位展示按预期执行', async () => {
  const reportBlockStart = 'function validateCommunityReportReason(req, res)';
  const reportBlockEnd = 'function buildCommunityPostSummary';
  const blockSource = clientRoutes.slice(clientRoutes.indexOf(reportBlockStart), clientRoutes.indexOf(reportBlockEnd));
  const routes = {};
  const sqlLog = [];
  let currentPost = { id: 10, user_id: 1, user_role: 'patient', status: 'approved' };
  let currentComment = { id: 20, post_id: 10, user_id: 1, status: 'approved' };
  let existingReport = null;

  runInNewContext(blockSource, {
    app: {
      post: (p, _auth, cb) => { routes['POST ' + p] = cb; },
      delete: (p, _auth, cb) => { routes['DELETE ' + p] = cb; }
    },
    authenticateWxToken() {},
    escapeHtml: v => String(v),
    notifyBusiness: async () => {},
    console,
    transaction: operation => operation({
      execute: async (sql, params) => {
        sqlLog.push({ sql, params });
        if (sql.includes('SELECT id FROM community_posts')) return [[currentPost]];
        if (sql.includes('SELECT id, user_id, user_role, status FROM community_posts')) return [[currentPost]];
        if (sql.includes('SELECT id, post_id FROM post_comments')) return [[currentComment]];
        if (sql.includes('SELECT id, post_id, user_id, status FROM post_comments')) return [[currentComment]];
        if (sql.includes('FROM community_reports')) return [[existingReport].filter(Boolean)];
        if (sql.includes('INSERT INTO community_reports')) return [{ insertId: 99 }];
        return [{}];
      }
    })
  });

  const makeRes = () => ({ statusCode: 200, body: null, status(v) { this.statusCode = v; return this; }, json(b) { this.body = b; } });

  // 1. Report comment
  let res = makeRes();
  await routes['POST /api/v1/community/comments/:id/report']({ params: { id: '20' }, body: { reason: '垃圾广告' }, user: { id: 2 } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /举报已提交/);

  // 2. Soft delete comment (forbidden for non-author, allowed for author, preserves child replies)
  res = makeRes();
  await routes['DELETE /api/v1/community/comments/:id']({ params: { id: '20' }, user: { id: 2 } }, res);
  assert.equal(res.statusCode, 403);

  sqlLog.length = 0;
  res = makeRes();
  await routes['DELETE /api/v1/community/comments/:id']({ params: { id: '20' }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sqlLog.some(x => x.sql.includes('parent_id = NULL')), false);
  assert.ok(sqlLog.some(x => x.sql.includes("UPDATE post_comments SET status = 'deleted'")));
  assert.ok(sqlLog.some(x => x.sql.includes('UPDATE community_posts SET comments_count')));

  // 3. Soft delete post (forbidden for non-author or admin, allowed for author)
  res = makeRes();
  await routes['DELETE /api/v1/community/posts/:id']({ params: { id: '10' }, user: { id: 2 } }, res);
  assert.equal(res.statusCode, 403);

  currentPost = { id: 10, user_id: 1, user_role: 'admin', status: 'approved' };
  res = makeRes();
  await routes['DELETE /api/v1/community/posts/:id']({ params: { id: '10' }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 403);

  currentPost = { id: 10, user_id: 1, user_role: 'patient', status: 'approved' };
  sqlLog.length = 0;
  res = makeRes();
  await routes['DELETE /api/v1/community/posts/:id']({ params: { id: '10' }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(sqlLog.some(x => x.sql.includes("UPDATE community_posts SET status = 'deleted'")));

  // 4. Detail endpoint redacts deleted parent comment with active reply, hides deleted leaf comment
  const detailStart = '// GET /api/v1/community/posts/:id';
  const detailEnd = 'function validateCommunityReportReason';
  const detailSource = clientRoutes.slice(clientRoutes.indexOf(detailStart), clientRoutes.indexOf(detailEnd));
  let detailHandler;
  runInNewContext(detailSource, {
    app: { get: (_p, cb) => { detailHandler = cb; } },
    getOptionalWxUser: () => ({ id: 99 }),
    communityPublisher: () => ({ author: '作者', avatar: '', role: 'patient', roleLabel: '鼾友' }),
    publicAvatar: v => v || '',
    buildSqlPlaceholders: arr => arr.map(() => '?').join(','),
    get: async sql => {
      if (sql.includes('FROM community_posts')) {
        return { id: 10, user_id: 1, user_role: 'patient', title: '帖子', content: '正文', approved_comments_count: 1, likes_count: 0, views_count: 0, favorites_count: 0, shares_count: 0, is_top: 0, published_at: '2026-11-27' };
      }
      return null;
    },
    run: async () => ({ changes: 0 }),
    query: async sql => {
      if (sql.includes('FROM post_comments c')) {
        return [
          { id: 1, post_id: 10, user_id: 2, parent_id: null, content: '敏感原评论', status: 'deleted', deleted_by: 'admin', likes_count: 3, author_name: '甲', author_avatar: '' },
          { id: 2, post_id: 10, user_id: 3, parent_id: 1, content: '正常的子回复', status: 'approved', likes_count: 1, author_name: '乙', parent_author_name: '甲', author_avatar: '' },
          { id: 3, post_id: 10, user_id: 4, parent_id: null, content: '无回复的已删评论', status: 'deleted', deleted_by: 'author', likes_count: 0, author_name: '丙', author_avatar: '' }
        ];
      }
      return [];
    },
    console
  });

  res = makeRes();
  await detailHandler({ params: { id: '10' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.commentsCount, 1);
  assert.equal(res.body.data.comments.length, 2);
  assert.equal(res.body.data.comments[0].isDeleted, true);
  assert.equal(res.body.data.comments[0].author, '');
  assert.equal(res.body.data.comments[0].content, '该评论已因不符合规范被移除');
  assert.equal(res.body.data.comments[1].content, '正常的子回复');
  assert.equal(res.body.data.comments[1].parentAuthor, '已删除评论');

  // 5. my-activity preserves commenter's comment when original post is deleted (without leaking post title)
  const actStart = "app.get('/api/v1/community/my-activity'";
  const actEnd = "app.get('/api/v1/community/posts',";
  const actSource = clientRoutes.slice(clientRoutes.indexOf(actStart), clientRoutes.indexOf(actEnd));
  let actHandler;
  runInNewContext(actSource, {
    app: { get: (_p, _auth, cb) => { actHandler = cb; } },
    authenticateWxToken() {},
    query: async () => [{
      record_id: 2, post_id: 10, title: '被删违规标题', post_status: 'deleted',
      comment_id: 2, comment_content: '我的合规评论', comment_status: 'approved',
      comment_delete_reason: null, comment_deleted_by: null, activity_at: '2026-11-27'
    }],
    console
  });
  res = makeRes();
  await actHandler({ query: { type: 'comments', page: '1' }, user: { id: 3 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.list[0].title, '原帖已删除');
  assert.equal(res.body.data.list[0].commentContent, '我的合规评论');
  assert.equal(res.body.data.list[0].postDeleted, true);
});

test('我的页面根据分销开关控制分销中心入口且门店页不自动定位', async () => {
  const profileJs = readFileSync(new URL('../../mp-weixin-rewrite/pages/profile/index.js', import.meta.url), 'utf8');
  let profilePage;
  let distEnabled = false;
  let loggedIn = true;
  runInNewContext(profileJs, {
    Page: cfg => { profilePage = cfg; },
    require: id => {
      if (id.endsWith('api/index')) {
        return {
          getMemberInfo: async () => ({ data: {} }),
          getMemberLevels: async () => ({ data: [] }),
          getNotifications: async () => ({ data: { list: [], unread: 0 } }),
          getImUnreadCount: async () => ({ data: { unread: 0 } }),
          getDistributionRules: async () => ({ data: { enabled: distEnabled } })
        };
      }
      if (id.endsWith('navigation')) return {};
      if (id.endsWith('session-store')) {
        return {
          getLoginGeneration: () => 1,
          isLoggedIn: () => loggedIn,
          fetchProfile: async () => ({ nickname: '患者A' })
        };
      }
      if (id.endsWith('image-url')) return { normalizeImageUrl: v => v || '' };
      return {};
    }
  });
  profilePage.setData = u => Object.assign(profilePage.data, u);
  await profilePage.loadPage();
  const keysWhenOff = profilePage.data.menuGroups.flatMap(g => g.items.map(i => i.key));
  assert.equal(keysWhenOff.includes('distribution'), false);

  loggedIn = false;
  await profilePage.loadPage();
  assert.equal(profilePage.data.menuGroups.flatMap(g => g.items.map(i => i.key)).includes('distribution'), false);

  distEnabled = true;
  await profilePage.loadPage();
  assert.equal(profilePage.data.menuGroups.flatMap(g => g.items.map(i => i.key)).includes('distribution'), true);

  loggedIn = true;
  await profilePage.loadPage();
  const keysWhenOn = profilePage.data.menuGroups.flatMap(g => g.items.map(i => i.key));
  assert.equal(keysWhenOn.includes('distribution'), true);

  const accountSecWxml = readFileSync(new URL('../../mp-weixin-rewrite/pages/profile/settings/account-security/index.wxml', import.meta.url), 'utf8');
  assert.equal(accountSecWxml.includes('推广后台'), false);

  const storeSelectJs = readFileSync(new URL('../../mp-weixin-rewrite/pages/appointment/store-select.js', import.meta.url), 'utf8');
  let storePage;
  let locationCalls = 0;
  runInNewContext(storeSelectJs, {
    Page: cfg => { storePage = cfg; },
    require: id => {
      if (id.endsWith('api/index')) return { getStores: async () => [{ id: '1', name: '门诊', latitude: 31.2, longitude: 121.4 }], getDoctors: async () => [{ id: 'd1', storeIds: ['1'] }], getScheduleDates: async () => ['2099-01-01'] };
      if (id.endsWith('navigation')) return {};
      if (id.endsWith('session-store')) return { isLoggedIn: () => true };
      if (id.endsWith('appointment-time')) return { getBeijingDate: () => '2026-01-01' };
      return {};
    },
    wx: {
      getLocation: ({ success }) => { locationCalls += 1; success({ latitude: 31.2, longitude: 121.4 }); },
      showToast() {}
    }
  });
  storePage.setData = u => Object.assign(storePage.data, u);
  await storePage.loadPage();
  assert.equal(locationCalls, 0);
  await storePage.requestLocationSort();
  assert.equal(locationCalls, 1);
  assert.equal(storePage.data.hasLocation, true);
});

test('提审配置合规检查：直播已排除打包且所有隐私页面均挂载弹窗组件', () => {
  const appJson = JSON.parse(readFileSync(new URL('../../mp-weixin-rewrite/app.json', import.meta.url), 'utf8'));
  const projectJson = JSON.parse(readFileSync(new URL('../../mp-weixin-rewrite/project.config.json', import.meta.url), 'utf8'));
  assert.equal((appJson.subpackages || []).some(s => s.root === 'pages/live'), false);
  assert.ok((projectJson.packOptions?.ignore || []).some(item => item.value === 'pages/live'));
  assert.ok((projectJson.packOptions?.ignore || []).some(item => item.value === 'test-data-integrity.js'));
  assert.ok((projectJson.packOptions?.ignore || []).some(item => item.value === 'test-environment-isolation.js'));

  const popupWxml = readFileSync(new URL('../../mp-weixin-rewrite/components/business/hj-privacy-popup/index.wxml', import.meta.url), 'utf8');
  assert.match(popupWxml, /id="agree-btn"/);

  for (const rel of [
    'pages/index/index.wxml',
    'pages/auth/login.wxml',
    'pages/appointment/confirm.wxml',
    'pages/appointment/detail.wxml',
    'pages/appointment/store-select.wxml',
    'pages/assessment/index.wxml',
    'pages/assessment/recording/index.wxml',
    'pages/product/detail.wxml',
    'pages/distribution/invite/index.wxml',
    'pages/profile/online-service/index.wxml',
    'pages/profile/family-members/add-member/index.wxml',
    'pages/profile/settings/personal-info/index.wxml',
    'pages/profile/settings/account-security/index.wxml'
  ]) {
    const src = readFileSync(new URL('../../mp-weixin-rewrite/' + rel, import.meta.url), 'utf8');
    assert.match(src, /<hj-privacy-popup\s+id="privacyPopup"\s*\/>/, rel + ' 缺少 hj-privacy-popup');
  }
});

test('图片安全检测在通过、超限、拦截和异常场景按预期阻断落盘', async (t) => {
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

  t.mock.method(console, 'warn', () => {});
  let tokenCount = 0;
  const imageRequests = [];
  let replies = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/stable_token')) {
      tokenCount += 1;
      return Response.json({ access_token: 'img-token-' + tokenCount, expires_in: 7200 });
    }
    imageRequests.push(String(url));
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return Response.json(next);
  });

  const sampleBuffer = Buffer.from('fake-jpeg-bytes');
  replies = [{ errcode: 40001 }, { errcode: 0 }];
  assert.equal(await checkWechatImage({ buffer: sampleBuffer, ext: 'jpg' }), 'pass');
  assert.equal(imageRequests.length, 2);
  assert.equal(new URL(imageRequests[1]).searchParams.get('access_token'), 'img-token-' + tokenCount);

  replies = [{ errcode: 87014 }];
  assert.equal(await checkWechatImage({ buffer: sampleBuffer, ext: 'png' }), 'blocked');

  replies = [new Error('timeout')];
  assert.equal(await checkWechatImage({ buffer: sampleBuffer, ext: 'jpg' }), 'unavailable');

  assert.equal(
    await checkWechatImage({ buffer: Buffer.alloc(WECHAT_IMAGE_MAX_BYTES + 1), ext: 'jpg' }),
    'too_large'
  );

  // Verify POST /api/v1/user/upload route blocks disk write on rejected/unavailable/too_large images
  const uploadStart = '// 20.1 Upload File (POST)';
  const uploadEnd = '// 20.2 Add Medical Attachment (POST)';
  const uploadSource = clientRoutes.slice(clientRoutes.indexOf(uploadStart), clientRoutes.indexOf(uploadEnd));
  let uploadHandler;
  let checkResult = 'pass';
  let writtenFiles = 0;
  let registeredUploads = 0;
  runInNewContext(uploadSource, {
    app: { post: (_p, _auth, _raw, cb) => { uploadHandler = cb; } },
    authenticateWxToken() {},
    express: { raw: () => () => {} },
    extractMultipartFileBuffer: buf => buf,
    checkWechatImage: async () => checkResult,
    rejectUncheckedContent,
    fs: { existsSync: () => true, mkdirSync() {}, writeFileSync: () => { writtenFiles += 1; } },
    registerPrivateUpload: async () => { registeredUploads += 1; },
    Buffer,
    console
  });

  const createRes = () => ({ statusCode: 200, body: null, status(v) { this.statusCode = v; return this; }, json(b) { this.body = b; } });
  for (const [decision, expectedStatus, expectedWritten] of [
    ['blocked', 422, 0],
    ['unavailable', 503, 0],
    ['too_large', 400, 0],
    ['pass', 200, 1]
  ]) {
    checkResult = decision;
    writtenFiles = 0;
    registeredUploads = 0;
    const res = createRes();
    await uploadHandler({ query: { ext: 'jpg' }, headers: { 'content-type': 'image/jpeg' }, body: sampleBuffer, user: { id: 1, openid: 'o' } }, res);
    assert.equal(res.statusCode, expectedStatus);
    assert.equal(writtenFiles, expectedWritten);
    assert.equal(registeredUploads, expectedWritten);
  }

  // Non-image files do not invoke image security check and succeed cleanly
  checkResult = 'blocked';
  writtenFiles = 0;
  registeredUploads = 0;
  const pdfRes = createRes();
  await uploadHandler({ query: { ext: 'pdf' }, headers: { 'content-type': 'application/pdf' }, body: sampleBuffer, user: { id: 1, openid: 'o' } }, pdfRes);
  assert.equal(pdfRes.statusCode, 200);
  assert.equal(writtenFiles, 1);

  // Deleted post detail returns 404 with explicit deleted prompt
  const detailStart = '// GET /api/v1/community/posts/:id';
  const detailEnd = 'function validateCommunityReportReason';
  const detailSource = clientRoutes.slice(clientRoutes.indexOf(detailStart), clientRoutes.indexOf(detailEnd));
  let detailHandler;
  runInNewContext(detailSource, {
    app: { get: (_p, cb) => { detailHandler = cb; } },
    getOptionalWxUser: () => null,
    get: async sql => (sql.includes("status = 'deleted'") ? { id: 10 } : null),
    run: async () => ({ changes: 0 }),
    query: async () => [],
    console
  });
  const delRes = createRes();
  await detailHandler({ params: { id: '10' } }, delRes);
  assert.equal(delRes.statusCode, 404);
  assert.equal(delRes.body.message, '该帖子已删除');
});

test('小程序 uploadLocalFile 对大图片先压缩并规范化内容安全错误提示', async () => {
  const userApiSrc = readFileSync(new URL('../../mp-weixin-rewrite/api/modules/user-api.js', import.meta.url), 'utf8');
  const reqModSrc = readFileSync(new URL('../../mp-weixin-rewrite/api/request.js', import.meta.url), 'utf8');
  const reqMod = { exports: {} };
  runInNewContext(reqModSrc, {
    module: reqMod,
    exports: reqMod.exports,
    require: id => (id.endsWith('asset-url') ? { normalizeAssets: d => d } : id.endsWith('env') ? { getApiBaseUrl: () => 'https://m.xingkangming.com/api/v1', getApiBaseUrls: () => ['https://m.xingkangming.com/api/v1'] } : { createTraceId: () => 't', report() {}, reportNow() {} }),
    wx: {}
  });
  let compressedCalled = 0;
  let uploadedPath = '';
  const userMod = { exports: {} };
  runInNewContext(userApiSrc, {
    module: userMod,
    exports: userMod.exports,
    require: id => (id.includes('request') ? reqMod.exports : { getAccessToken: () => 'jwt.token.val' }),
    wx: {
      getFileSystemManager: () => ({
        getFileInfo: ({ success }) => success({ size: 2 * 1024 * 1024 })
      }),
      compressImage: ({ src, success }) => {
        compressedCalled += 1;
        success({ tempFilePath: src + '.compressed.jpg' });
      },
      uploadFile: ({ filePath, success }) => {
        uploadedPath = filePath;
        success({ statusCode: 422, data: JSON.stringify({ code: 'CONTENT_REJECTED', message: 'internal detail' }) });
      }
    }
  });
  await assert.rejects(
    () => userMod.exports.uploadLocalFile('/tmp/avatar.png', 'png'),
    err => err.message === '发布内容包含违规信息，请修改后重试'
  );
  assert.equal(compressedCalled, 1);
  assert.equal(uploadedPath, '/tmp/avatar.png.compressed.jpg');
});
