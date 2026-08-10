"use strict";
const api = require("../../../../api/index.js");

const MEMBER_LABEL_MAP = {
  self: "本人",
  spouse: "配偶",
  child: "子女",
  parent: "父母",
  sibling: "兄弟姐妹",
  other: "其他",
};

const TYPE_MAP = {
  clean: { label: "清洁", color: "#3B6BF5" },
  repair: { label: "维修", color: "#EF4444" },
  adjust: { label: "调试", color: "#1A9D5C" },
};

Page({
  data: {
    loading: true,
    hasLoaded: false,
    members: [],
    memberOptions: [],
    memberIndex: 0,
    selectedPatientId: "",
    records: [],
  },

  onShow() {
    this.loadPage({ silent: this.data.hasLoaded });
  },

  getStoragePatientId() {
    return wx.getStorageSync("selected_treatment_patient_id") || "";
  },

  setStoragePatientId(patientId) {
    if (patientId) {
      wx.setStorageSync("selected_treatment_patient_id", String(patientId));
    }
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const memberRes = await api.getFamilyMembers();
      const members = (memberRes.data && memberRes.data.list) || memberRes.list || [];
      let selectedPatientId = this.getStoragePatientId();
      if (!selectedPatientId || !members.some((item) => String(item.id) === String(selectedPatientId))) {
        const selfMember = members.find((item) => item.relation === "self") || members[0] || null;
        selectedPatientId = selfMember ? String(selfMember.id) : "";
        this.setStoragePatientId(selectedPatientId);
      }
      const memberOptions = members.map((item) => `${item.name}（${MEMBER_LABEL_MAP[item.relation] || "成员"}）`);
      const memberIndex = Math.max(0, members.findIndex((item) => String(item.id) === String(selectedPatientId)));
      const res = await api.getDeviceMaintenance(selectedPatientId ? { patientId: selectedPatientId } : {});
      const records = ((res.data && res.data.list) || res.list || []).map((item) => {
        const meta = TYPE_MAP[item.type] || TYPE_MAP.clean;
        return {
          ...item,
          costText: Number(item.cost || 0) > 0 ? `¥${Number(item.cost || 0).toFixed(2)}` : "",
          typeLabel: meta.label,
          typeColor: meta.color,
          typeBg: `${meta.color}18`,
        };
      });
      this.setData({ hasLoaded: true, members, memberOptions, memberIndex, selectedPatientId, records, loading: false });
    } catch (err) {
      console.error("加载维护记录失败", err);
      wx.showToast({ title: err.message || "加载维护记录失败", icon: "none" });
      if (!this.data.hasLoaded) {
        this.setData({ records: [], loading: false });
      } else {
        this.setData({ loading: false });
      }
    }
  },

  async onMemberChange(event) {
    const nextIndex = Number(event.detail.value || 0);
    const nextMember = this.data.members[nextIndex];
    if (!nextMember) return;
    this.setStoragePatientId(nextMember.id);
    await this.loadPage();
  },
});
