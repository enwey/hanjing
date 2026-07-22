const { request } = require('../request');

function getCommunityPosts() {
  return request({ url: '/community/posts', method: 'GET', failMessage: '加载社区帖子失败' });
}

function getCommunityPostDetail(postId) {
  return request({ url: '/community/posts/' + postId, method: 'GET', failMessage: '加载帖子详情失败' });
}

function createCommunityPost(data) {
  return request({ url: '/community/posts', method: 'POST', data, failMessage: '发布帖子失败' });
}

function likeCommunityPost(postId, isLiked) {
  return request({ url: '/community/posts/' + postId + '/like', method: 'POST', data: { isLiked }, failMessage: '帖子点赞失败' });
}

function likeCommunityComment(commentId, isLiked) {
  return request({ url: '/community/comments/' + commentId + '/like', method: 'POST', data: { isLiked }, failMessage: '评论点赞失败' });
}

function commentCommunityPost(postId, content, parentId) {
  return request({ url: '/community/posts/' + postId + '/comment', method: 'POST', data: { content, parentId: parentId || null }, failMessage: '发表评论失败' });
}

function reportCommunityPost(postId, reason) {
  return request({ url: '/community/posts/' + postId + '/report', method: 'POST', data: { reason }, failMessage: '举报帖子失败' });
}

module.exports = {
  getCommunityPosts,
  getCommunityPostDetail,
  createCommunityPost,
  likeCommunityPost,
  likeCommunityComment,
  commentCommunityPost,
  reportCommunityPost
};
