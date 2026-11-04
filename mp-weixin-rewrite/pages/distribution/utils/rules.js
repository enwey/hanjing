// Keep invitation and distribution center on the same server-provided rules.
function normalizeDistributionRules(response) {
  const data = response && response.data ? response.data : response || {};
  const payload = data.data || data;
  return {
    qualificationText: payload.qualificationText || '',
    commissionRules: payload.commissionRules || [],
    promotionWays: payload.promotionWays || [],
    withdrawRules: payload.withdrawRules || [],
  };
}
module.exports = { normalizeDistributionRules };
