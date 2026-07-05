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
  adjust: { label: "调整", color: "#F59E0B" },
  replace: { label: "更换", color: "#1A9D5C" },
};

Page({
  data: {
    loading: true,
    members: [],
    memberOptions: [],
    memberIndex: 0,
    selectedPatientId: "",
    records: [],
  },

  onShow() {
    this.loadPage();
  },

  getStoragePatientId() {
    return wx.getStorageSync("selected_treatment_patient_id") || "";
  },

  setStoragePatientId(patientId) {
    if (patientId) {
      wx.setStorageSync("selected_treatment_patient_id", String(patientId));
    }
  },

  async loadPage() {
    this.setData({ loading: true });
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
      const rawRecords = (res.data && res.data.list) || res.list || [];
      const records = rawRecords.map((item) => {
        const typeMeta = TYPE_MAP[item.type] || TYPE_MAP.clean;
        return {
          ...item,
          typeLabel: typeMeta.label,
          typeColor: typeMeta.color,
          typeBg: `${typeMeta.color}18`,
          costText: Number(item.cost || 0) > 0 ? `¥${(Number(item.cost || 0) / 100).toFixed(2)}` : "",
        };
      });
      this.setData({ members, memberOptions, memberIndex, selectedPatientId, records });
    } catch (err) {
      console.error("加载维护记录失败", err);
      wx.showToast({ title: err.message || "加载维护记录失败", icon: "none" });
      this.setData({ records: [] });
    } finally {
      this.setData({ loading: false });
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
