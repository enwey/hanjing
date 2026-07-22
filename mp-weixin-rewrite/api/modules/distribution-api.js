const { request } = require('../request');

function getDistributorInfo() {
  return request({ url: '/distribution/info', method: 'GET', failMessage: '加载分销信息失败' });
}

function openDistribution() {
  return request({ url: '/distribution/open', method: 'POST', failMessage: '开通分销失败' });
}

function getDistributionInviteInfo() {
  return request({ url: '/distribution/invite-info', method: 'GET', failMessage: '加载邀请信息失败' });
}

function bindDistribution(inviteCode) {
  return request({ url: '/distribution/bind', method: 'POST', data: { inviteCode }, failMessage: '绑定邀请关系失败' });
}

function getDistributionRules() {
  return request({ url: '/distribution/rules', method: 'GET', failMessage: '加载分销规则失败' });
}

function getDistributionProducts() {
  return request({ url: '/distribution/products', method: 'GET', failMessage: '加载分销商品失败' });
}

function getDistributionOrders(query) {
  return request({ url: '/distribution/orders', method: 'GET', data: query, failMessage: '加载分销订单失败' });
}

function getDistributionCommissions() {
  return request({ url: '/distribution/commissions', method: 'GET', failMessage: '加载佣金记录失败' });
}

function getDistributionCommissionStats() {
  return request({ url: '/distribution/commission-stats', method: 'GET', failMessage: '加载佣金统计失败' });
}

function getTeamMembers() {
  return request({ url: '/distribution/team', method: 'GET', failMessage: '加载团队成员失败' });
}

function applyWithdraw(amount, method, bankInfo) {
  return request({ url: '/distribution/withdraw', method: 'POST', data: { amount, method, bankInfo }, failMessage: '申请提现失败' });
}

function getWithdrawRecords() {
  return request({ url: '/distribution/withdraws', method: 'GET', failMessage: '加载提现记录失败' });
}

module.exports = {
  getDistributorInfo,
  openDistribution,
  getDistributionInviteInfo,
  bindDistribution,
  getDistributionRules,
  getDistributionProducts,
  getDistributionOrders,
  getDistributionCommissions,
  getDistributionCommissionStats,
  getTeamMembers,
  applyWithdraw,
  getWithdrawRecords
};
