const STORAGE_KEY = 'rewrite_appointment_draft';

const appointmentDraftStore = {
  getDraft() {
    return wx.getStorageSync(STORAGE_KEY) || null;
  },

  setDraft(draft) {
    wx.setStorageSync(STORAGE_KEY, draft || {});
  },

  clearDraft() {
    wx.removeStorageSync(STORAGE_KEY);
  },
};

module.exports = appointmentDraftStore;
