const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const directory = path.join(__dirname, '../../mp-weixin-rewrite/pages/community/detail');
const source = fs.readFileSync(path.join(directory, 'index.js'), 'utf8');

function makePage(api = {}, intl = Intl) {
  let page;
  const events = [];
  vm.runInNewContext(source, {
    require: id => {
      if (id.includes('api/index')) return api;
      if (id.includes('image-url')) return { normalizeImageUrl: value => value || '' };
      if (id.includes('article-rich-text')) return require('../../mp-weixin-rewrite/pages/community/utils/article-rich-text');
      if (id.includes('date-time')) return { formatChinaDateTime: value => value };
      return {};
    },
    Page: definition => { page = definition; },
    Intl: intl,
    wx: {
      hideKeyboard: () => events.push('hideKeyboard'),
      pageScrollTo: options => events.push(options),
      showToast: ({ title }) => events.push(title),
    },
  });
  page.setData = (values, callback) => {
    Object.assign(page.data, values);
    callback?.();
  };
  Object.assign(page.data, {
    postId: '1',
    postDetail: { id: '1', commentsCount: 1 },
    commentsList: [{ id: '2', author: '用户甲' }],
  });
  return { page, events };
}

const tap = dataset => ({ currentTarget: { dataset } });
const input = (value, cursor = value.length) => ({ detail: { value, cursor } });
const keyboard = height => ({ detail: { height } });

test('回复对象和草稿在收起键盘、切换页面和取消回复时按预期保留', () => {
  const { page } = makePage();
  page.handleReply(tap({ commentId: '2' }));
  assert.equal(page.data.replyTarget.author, '用户甲');
  assert.equal(page.data.composerFocus, true);
  page.handleComposerFocus(keyboard(290));
  page.handleComposerBlur(input(''));
  page.handleKeyboardHeight(keyboard(0));
  assert.equal(page.data.replyTarget.id, '2');
  assert.equal(page.data.composerMode, 'idle');
  page.toggleCommentEmoji();
  page.handleCommentInput(input('草稿'));
  page.dismissCommentInput();
  assert.equal(page.data.composerMode, 'idle');
  assert.equal(page.data.commentInput, '草稿');
  page.onHide();
  assert.equal(page.data.replyTarget.id, '2');
  assert.equal(page.data.commentInput, '草稿');
  page.clearReplyTarget();
  assert.equal(page.data.replyTarget, null);
  assert.equal(page.data.commentInput, '草稿');
});

test('键盘和表情原位切换，表情插在失焦时的光标位置', () => {
  const { page, events } = makePage();
  page.handleComposerFocus(keyboard(302));
  page.handleCommentInput(input('甲乙丙', 3));
  page.toggleCommentEmoji();
  assert.equal(page.data.composerMode, 'emoji');
  assert.equal(page.data.keyboardHeight, 302);
  assert.equal(events.at(-1), 'hideKeyboard');
  page.handleComposerBlur(input('甲乙丙', 1));
  page.handleKeyboardHeight(keyboard(0));
  assert.equal(page.data.emojiPanelHeight, 302);
  page.insertCommentEmoji(tap({ emoji: '❤️' }));
  page.insertCommentEmoji(tap({ emoji: '😀' }));
  assert.equal(page.data.commentInput, '甲❤️😀乙丙');
  page.deleteCommentCharacter();
  assert.equal(page.data.commentInput, '甲❤️乙丙');
  page.toggleCommentEmoji();
  assert.equal(page.data.keepEmojiPanel, true);
  assert.equal(page.data.commentCursor, '甲❤️'.length);
  page.handleComposerFocus(keyboard(302));
  assert.equal(page.data.keepEmojiPanel, false);
  assert.equal(page.data.composerMode, 'keyboard');
  page.handleKeyboardHeight(keyboard(0));
  assert.equal(page.data.composerMode, 'idle');
  assert.equal(page.data.commentInput, '甲❤️乙丙');
});

test('表情退格整枚删除，面板插入遵守评论长度上限', () => {
  const { page, events } = makePage();
  page.handleCommentInput(input('甲👩‍👩‍👧‍👦乙', '甲👩‍👩‍👧‍👦'.length));
  page.toggleCommentEmoji();
  page.deleteCommentCharacter();
  assert.equal(page.data.commentInput, '甲乙');

  const { page: fallback } = makePage({}, {});
  fallback.toggleCommentEmoji();
  fallback.insertCommentEmoji(tap({ emoji: '✌️' }));
  fallback.deleteCommentCharacter();
  assert.equal(fallback.data.commentInput, '');

  const nearLimit = '字'.repeat(499);
  page.handleCommentInput(input(nearLimit));
  page.insertCommentEmoji(tap({ emoji: '😀' }));
  assert.equal(page.data.commentInput, nearLimit);
  assert.equal(events.at(-1), '评论最多 500 字');
  page.handleCommentLineChange({ detail: { lineCount: 8 } });
  assert.equal(page.data.commentLines, 4);
});

test('表情可以单独回复，发送失败保留草稿和对象，成功后清空', async () => {
  let calls = 0;
  let finish;
  const { page, events } = makePage({
    commentCommunityPost(postId, content, replyId) {
      calls++;
      assert.deepEqual([postId, content, replyId], ['1', '👍', '2']);
      if (calls === 1) return Promise.reject(new Error('回复的评论不存在'));
      return new Promise(resolve => { finish = resolve; });
    },
  });
  page.handleReply(tap({ commentId: '2' }));
  page.toggleCommentEmoji();
  page.insertCommentEmoji(tap({ emoji: '👍' }));
  await page.submitComment(input('  '));
  assert.equal(calls, 0);
  page.handleCommentInput(input('👍 尚未同步的草稿'));
  await page.submitComment(input('👍'));
  assert.equal(page.data.commentInput, '👍');
  assert.equal(page.data.replyTarget.id, '2');
  assert.equal(events.at(-1), '回复的评论不存在');

  const pending = page.submitComment(input('👍'));
  await page.submitComment(input('👍'));
  assert.equal(calls, 2);
  finish({ data: { id: 3, content: '👍', parentId: 2 } });
  await pending;
  assert.equal(page.data.commentInput, '');
  assert.equal(page.data.replyTarget, null);
  assert.equal(page.data.composerMode, 'idle');
  assert.equal(page.data.isSubmitting, false);
  assert.equal(page.data.commentsList[0].content, '👍');
});


test('回复栏的发送只绑定到输入框的键盘确认事件', () => {
  const template = fs.readFileSync(path.join(directory, 'index.wxml'), 'utf8');
  const textarea = template.match(/<textarea\b[\s\S]*?\/>/)[0];
  assert.match(textarea, /confirm-type="send"/);
  assert.match(textarea, /bindconfirm="submitComment"/);
  assert.doesNotMatch(template, /bindtap="submitComment"|comment-bar__send/);
});


test('评论入口避开固定导航栏，回复框空白可触发焦点且保留原生光标', () => {
  const { page, events } = makePage();
  page.selectComponent = id => {
    assert.equal(id, '#post-detail-navbar');
    return { data: { totalHeight: 82 } };
  };
  page.focusComposer({ target: { id: 'comment-composer' } });
  assert.equal(page.data.composerFocus, false);
  page.focusComposer({ target: {} });
  assert.equal(page.data.composerFocus, true);
  page.handleComposerFocus(keyboard(280));
  page.handleCommentInput(input('保留这条草稿'));
  page.jumpToComments();
  assert.equal(page.data.composerFocus, false);
  assert.equal(page.data.commentInput, '保留这条草稿');
  assert.equal(events.at(-2), 'hideKeyboard');
  assert.equal(events.at(-1).selector, '#post-comments');
  assert.equal(events.at(-1).offsetTop, -90);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('详情首屏先显示正文，慢头像独立补齐且卸载后忽略迟到结果', async () => {
  const profile = deferred();
  const lateProfile = deferred();
  let requests = 0;
  const { page } = makePage({
    getCommunityPostDetail: async () => ({ id: 1, title: '正文已返回', comments: [{ id: 2, content: '评论' }] }),
    getUserProfile: () => (++requests === 1 ? profile.promise : lateProfile.promise),
  });
  page.data.postDetail = null;
  const load = page.loadPostDetail('1', { silent: true });
  assert.equal(page.data.loading, true);
  await load;
  assert.equal(page.data.loading, false);
  assert.equal(page.data.postDetail.title, '正文已返回');
  assert.equal(page.data.commentsList[0].content, '评论');
  assert.equal(page.data.currentUserAvatar.avatar, '');
  profile.resolve({ avatar: 'first.png' });
  await new Promise(setImmediate);
  assert.equal(page.data.currentUserAvatar.avatar, 'first.png');

  await page.loadPostDetail('1', { silent: true });
  page.onUnload();
  lateProfile.resolve({ avatar: 'late.png' });
  await new Promise(setImmediate);
  assert.equal(page.data.currentUserAvatar.avatar, 'first.png');
});

test('返回详情静默更新并保留已加载头像，权限变更后清理旧内容', async () => {
  const refresh = deferred();
  const initial = {
    id: 1, title: '详情', avatar: 'author.png', comments: [{ id: 2, avatar: 'comment.png' }],
  };
  let calls = 0;
  const { page, events } = makePage({
    async getCommunityPostDetail() {
      calls++;
      if (calls === 2) return refresh.promise;
      if (calls === 3) throw Error('网络断开');
      if (calls === 4) throw Object.assign(Error('帖子已不可见'), { statusCode: 404 });
      return initial;
    },
    async getUserProfile() { throw Error('头像暂不可用'); },
  });
  await page.loadPostDetail('1');
  page.data.postDetail.avatarLoaded = true;
  page.data.commentsList[0].avatarLoaded = true;
  const returning = page.onShow();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.postDetail.title, '详情');
  refresh.resolve({ ...initial, title: '更新后的详情' });
  await returning;
  assert.equal(page.data.postDetail.avatarLoaded, true);
  assert.equal(page.data.commentsList[0].avatarLoaded, true);

  await page.onShow();
  assert.equal(page.data.postDetail.title, '更新后的详情');
  assert.equal(events.at(-1), '网络断开');
  await page.onShow();
  assert.equal(page.data.postDetail, null);
  assert.equal(page.data.loadError, '帖子已不可见');

  const retry = page.retryLoad();
  assert.equal(page.data.loading, true);
  assert.equal(page.data.loadError, '');
  await retry;
  assert.equal(page.data.postDetail.title, '详情');
  assert.equal(page.data.loading, false);
});

test('旧详情响应不能盖掉较新内容或已发表的回复', async () => {
  const oldDetail = deferred();
  const refresh = deferred();
  let calls = 0;
  const { page } = makePage({
    getCommunityPostDetail() {
      calls++;
      if (calls === 1) return oldDetail.promise;
      if (calls === 3) return refresh.promise;
      return { id: 1, title: '较新的正文', commentsCount: 0 };
    },
    getUserProfile: async () => null,
    commentCommunityPost: async () => ({ id: 'new-comment', content: '刚发表的回复' }),
  });
  page.data.postDetail = null;
  const older = page.onShow();
  await page.onShow();
  oldDetail.resolve({ id: 1, title: '旧的正文' });
  await older;
  assert.equal(page.data.postDetail.title, '较新的正文');

  const pending = page.onShow();
  page.handleCommentInput(input('刚发表的回复'));
  await page.submitComment();
  refresh.resolve({ id: 1, title: '较新的正文', commentsCount: 0, comments: [] });
  await pending;
  assert.equal(page.data.commentsList[0].id, 'new-comment');
  assert.equal(page.data.postDetail.commentsCount, 1);
});
