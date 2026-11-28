const { request } = require('../request');

async function submitCommunityContent(options) {
  try {
    return await request(options);
  } catch (error) {
    const code = error?.data?.code;
    if (code === 'CONTENT_REJECTED') {
      throw new Error('发布内容包含违规信息，请修改后重试');
    }
    if (code === 'CONTENT_CHECK_UNAVAILABLE') {
      throw new Error('暂时无法发布，请稍后重试');
    }
    throw error;
  }
}

function getMyCommunityActivity(type, page) {
  return request({ url: '/community/my-activity', method: 'GET', data: { type, page }, failMessage: '加载社区记录失败' });
}
function getCommunityPosts() {
  return request({ url: '/community/posts', method: 'GET', failMessage: '加载社区帖子失败' });
}

function getCommunityPostDetail(postId) {
  return request({ url: '/community/posts/' + postId, method: 'GET', failMessage: '加载帖子详情失败' });
}

function getCommunityPostForEdit(id) { return request({url:'/community/posts/'+id+'/edit',method:'GET',failMessage:'加载待修改帖子失败'}); }
function updateCommunityPost(id,data) { return submitCommunityContent({url:'/community/posts/'+id+'/edit',method:'PUT',data,failMessage:'提交审核失败'}); }

function createCommunityPost(data) {
  return submitCommunityContent({ url: '/community/posts', method: 'POST', data, failMessage: '发布帖子失败' });
}

function likeCommunityPost(postId, isLiked) {
  return request({ url: '/community/posts/' + postId + '/like', method: 'POST', data: { isLiked }, failMessage: '帖子点赞失败' });
}

function favoriteCommunityPost(postId, isFavorited) {
  return request({ url: '/community/posts/' + postId + '/favorite', method: 'POST', data: { isFavorited }, failMessage: '帖子收藏失败' });
}

function shareCommunityPost(postId) {
  return request({ url: '/community/posts/' + postId + '/share', method: 'POST', data: {}, failMessage: '记录分享失败' });
}

function likeCommunityComment(commentId, isLiked) {
  return request({ url: '/community/comments/' + commentId + '/like', method: 'POST', data: { isLiked }, failMessage: '评论点赞失败' });
}

function commentCommunityPost(postId, content, parentId) {
  return submitCommunityContent({ url: '/community/posts/' + postId + '/comment', method: 'POST', data: { content, parentId: parentId || null }, failMessage: '发表评论失败' });
}

function reportCommunityPost(postId, reason, commentId) {
  return request({ url: '/community/posts/' + postId + '/report', method: 'POST', data: { reason, ...(commentId ? { commentId } : {}) }, failMessage: '举报失败' });
}

function reportCommunityComment(commentId, reason) {
  return request({ url: '/community/comments/' + commentId + '/report', method: 'POST', data: { reason }, failMessage: '举报评论失败' });
}

function deleteCommunityPost(postId) {
  return request({ url: '/community/posts/' + postId, method: 'DELETE', failMessage: '删除帖子失败' });
}

function deleteCommunityComment(commentId) {
  return request({ url: '/community/comments/' + commentId, method: 'DELETE', failMessage: '删除评论失败' });
}

module.exports = {
  getMyCommunityActivity,
  getCommunityPosts,
  getCommunityPostDetail,
  createCommunityPost,
  getCommunityPostForEdit,
  updateCommunityPost,
  likeCommunityPost,
  favoriteCommunityPost,
  shareCommunityPost,
  likeCommunityComment,
  commentCommunityPost,
  reportCommunityPost,
  reportCommunityComment,
  deleteCommunityPost,
  deleteCommunityComment
};
