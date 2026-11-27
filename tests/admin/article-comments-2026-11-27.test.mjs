import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { hasAdminPermission, requiredAdminPermissions } from '../../hanjing-clinic-backend/admin-permissions.js';

test('管理端文章评论接口权限映射符合内容管理粒度', () => {
  const getPolicy = requiredAdminPermissions('GET', '/api/admin/content/articles/12/comments');
  assert.deepEqual(getPolicy, ['content:view']);
  assert.equal(hasAdminPermission({ permissions: ['content:view'] }, getPolicy), true);
  assert.equal(hasAdminPermission({ permissions: [] }, getPolicy), false);

  const putPolicy = requiredAdminPermissions('PUT', '/api/admin/content/comments/34', { body: { content: 'ok' } });
  assert.deepEqual(putPolicy, ['content:edit']);
  assert.equal(hasAdminPermission({ permissions: ['content:edit'] }, putPolicy), true);
  assert.equal(hasAdminPermission({ permissions: ['content:view'] }, putPolicy), false);

  const delPolicy = requiredAdminPermissions('DELETE', '/api/admin/content/comments/34');
  assert.deepEqual(delPolicy, ['content:delete']);
  assert.equal(hasAdminPermission({ permissions: ['content:delete'] }, delPolicy), true);
  assert.equal(hasAdminPermission({ permissions: ['content:edit'] }, delPolicy), false);
});

test('管理端文章评论查看、编辑与删除接口逻辑按预期执行', async () => {
  const source = await fs.readFile(new URL('../../hanjing-clinic-backend/routes/admin.js', import.meta.url), 'utf8');
  const start = source.indexOf('const decodeCommentText =');
  const end = source.indexOf('// Article Categories (健康科普分类)', start);
  const block = source.slice(start, end);

  const handlers = {};
  const sqlLog = [];
  let postExists = true;
  let commentRow = {
    id: 5,
    post_id: 10,
    user_id: 8,
    content: '&lt;原评论&gt;',
    status: 'approved',
    post_title: '睡眠科普'
  };

  runInNewContext(block, {
    app: {
      get: (p, _auth, cb) => { handlers['GET ' + p] = cb; },
      put: (p, _auth, cb) => { handlers['PUT ' + p] = cb; },
      delete: (p, _auth, cb) => { handlers['DELETE ' + p] = cb; }
    },
    authenticateToken() {},
    get: async () => (postExists ? { id: 10, title: '睡眠科普' } : null),
    query: async () => [
      {
        id: 5,
        post_id: 10,
        user_id: 8,
        parent_id: null,
        author_name: '患者A',
        author_phone: 'enc',
        parent_author_name: '',
        content: '&lt;原评论&gt;',
        likes_count: 2,
        status: 'approved',
        created_at: '2026-11-27T10:00:00Z'
      }
    ],
    decryptPII: () => '13800001234',
    maskPhone: v => v.slice(0, 3) + '****' + v.slice(-4),
    escapeHtml: v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    writeNotification: async (_conn, note) => { sqlLog.push({ note }); },
    logAdminAction: async (...args) => { sqlLog.push({ audit: args }); },
    transaction: operation => operation({
      execute: async (sql, params) => {
        sqlLog.push({ sql, params });
        if (sql.includes('SELECT id, post_id, content, status FROM post_comments')) return [[commentRow]];
        if (sql.includes('FROM post_comments c')) return [[commentRow]];
        return [{}];
      }
    })
  });

  const makeRes = () => ({ statusCode: 200, body: null, status(v) { this.statusCode = v; return this; }, json(b) { this.body = b; } });

  // 1. 查看评论（还原实体、脱敏手机号）
  let res = makeRes();
  await handlers['GET /api/admin/content/articles/:id/comments']({ params: { id: '10' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.list[0].content, '<原评论>');
  assert.equal(res.body.data.list[0].author_phone, '138****1234');

  // 2. 编辑评论内容与状态（approved -> rejected 会扣减 comments_count）
  sqlLog.length = 0;
  res = makeRes();
  await handlers['PUT /api/admin/content/comments/:id'](
    { params: { id: '5' }, body: { content: '<修改后>', status: 'rejected' }, user: { id: 1 } },
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.content, '<修改后>');
  assert.ok(sqlLog.some(x => x.sql?.includes('UPDATE post_comments') && x.sql?.includes('SET content = ?, status = ?')));
  assert.ok(sqlLog.some(x => x.sql?.includes('comments_count = GREATEST(0, comments_count - 1)')));

  // 3. 软删除评论（保留子回复链，置为 deleted 并通知作者）
  sqlLog.length = 0;
  commentRow.status = 'approved';
  res = makeRes();
  await handlers['DELETE /api/admin/content/comments/:id']({ params: { id: '5' }, body: { reason: '广告导流' }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sqlLog.some(x => x.sql?.includes('parent_id = NULL')), false);
  assert.ok(sqlLog.some(x => x.sql?.includes("UPDATE post_comments SET status = 'deleted'")));
  assert.ok(sqlLog.some(x => x.sql?.includes('comments_count = GREATEST(0, comments_count - 1)')));
  assert.ok(sqlLog.some(x => x.note?.title === '评论已移除' && x.note?.content.includes('广告导流')));
});
