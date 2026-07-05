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
      const res = await api.getWearingRecords(selectedPatientId ? { patientId: selectedPatientId } : {});
      const records = (res.data || res || []).map((item) => ({
        ...item,
        progressWidth: `${Math.max(0, Math.min(100, Number(item.wearDuration || 0) / 8 * 100))}%`,
        progressColor: Number(item.wearDuration || 0) >= 6 ? "#1A9D5C" : Number(item.wearDuration || 0) >= 4 ? "#F59E0B" : "#EF4444",
      }));
      this.setData({ members, memberOptions, memberIndex, selectedPatientId, records });
    } catch (err) {
      console.error("加载佩戴数据失败", err);
      wx.showToast({ title: err.message || "加载佩戴数据失败", icon: "none" });
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
