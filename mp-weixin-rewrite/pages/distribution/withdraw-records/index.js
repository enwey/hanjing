const api = require('../../../api/index');
const { formatChinaDate } = require('../../../common/utils/date-time');

const STATUS_LABEL_MAP = {
  pending: '待审核',
  processing: '处理中',
  approved: '已通过',
  completed: '已到账',
  paid: '已打款',
  transferred: '已到账',
  success: '已到账',
  rejected: '已驳回',
  failed: '已驳回',
};

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    records: [],
    summary: {
      totalAmountLabel: '¥0.00',
      completedCount: '0',
      processingCount: '0',
    },
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const response = await api.getWithdrawRecords();
      const records = unwrapList(response).map((record) => {
        const accountInfo = record.accountInfo || {};
        const accountLabel = accountInfo.label || (
          accountInfo.method === 'bank'
            ? ((accountInfo.bankName || '银行卡') + ' ' + (accountInfo.accountNo || '')).trim()
            : '微信零钱'
        );
        return {
          id: String(record.id || ''),
          amountValue: Number(record.amount || 0),
          actualAmountValue: Number(record.actualAmount ?? (Number(record.amount) - Number(record.fee || 0))),
          amountLabel: '¥' + (Number(record.amount || 0) / 100).toFixed(2),
          accountLabel,
          status: record.status || 'pending',
          statusLabel: STATUS_LABEL_MAP[record.status] || '状态待确认',
          createdDate: formatChinaDate(record.createdAt || ''),
        };
      });
      const completed = records.filter((record) => ['paid', 'completed', 'transferred', 'success'].includes(record.status));
      const totalAmount = completed.reduce((sum, record) => sum + record.actualAmountValue, 0);
      const completedCount = completed.length;
      const processingCount = records.filter((record) => ['pending', 'processing', 'approved'].includes(record.status)).length;
      this.setData({
        hasLoaded: true,
        loading: false,
        records,
        summary: {
          totalAmountLabel: '¥' + (totalAmount / 100).toFixed(2),
          completedCount: String(completedCount),
          processingCount: String(processingCount),
        },
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载提现记录失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载提现记录失败', icon: 'none' });
    }
  },
});
