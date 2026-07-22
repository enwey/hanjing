const distributionApi = require('../api/index');

async function loadInviteShareInfo() {
  const results = await Promise.all([
    distributionApi.getDistributionInviteInfo(),
    distributionApi.getDistributorInfo(),
  ]);
  const inviteData = results[0].data || results[0] || {};
  const distributorData = results[1].data || results[1] || {};
  const inviteCode = inviteData.inviteCode || distributorData.inviteCode || distributorData.invite_code || '';
  return {
    inviteCode,
    inviteQrCode: inviteData.inviteQrCode || distributorData.inviteQrCode || '',
    sharePath: inviteData.sharePath || (inviteCode ? '/pages/index/index?inviteCode=' + inviteCode : '/pages/index/index'),
    shareTitle: inviteData.shareTitle || '邀请好友体验鼾静健康诊所',
  };
}

module.exports = { loadInviteShareInfo };
