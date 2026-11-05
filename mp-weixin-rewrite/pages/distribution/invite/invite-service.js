const distributionApi = require('../../../api/index');

async function loadInviteShareInfo() {
  const response = await distributionApi.getDistributionInviteInfo();
  const inviteData = response.data || response || {};
  const inviteCode = inviteData.inviteCode || '';
  return {
    isDistributor: Boolean(inviteData.isDistributor),
    inviteCode,
    inviteQrCode: inviteData.inviteQrCode || '',
    inviteQrReason: inviteData.inviteQrReason || '',
    sharePath: inviteData.sharePath || (inviteCode ? '/pages/index/index?inviteCode=' + inviteCode : '/pages/index/index'),
    shareTitle: inviteData.shareTitle || '邀请好友体验兴康明诊所',
  };
}

module.exports = { loadInviteShareInfo };
