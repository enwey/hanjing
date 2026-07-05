"use strict";
const api = require("../../../api/index.js");

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
    device: null,
    menuItems: [
      {
        key: "wearing",
        icon: "/static/icons/trend.svg",
        label: "佩戴数据",
        desc: "查看当前就诊人的佩戴记录",
        url: "/pages/profile/device-manage/wearing-data/index",
      },
      {
        key: "maintenance",
        icon: "/static/icons/adjust.svg",
        label: "维护记录",
        desc: "查看清洁、调整与维修记录",
        url: "/pages/profile/device-manage/maintenance/index",
      },
      {
        key: "feedback",
        icon: "/static/icons/chat.svg",
        label: "使用反馈",
        desc: "提交问题并查看处理进度",
        url: "/pages/profile/device-manage/feedback/index",
      },
    ],
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
    } else {
      wx.removeStorageSync("selected_treatment_patient_id");
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
      const treatmentRes = await api.getTreatmentRecord(selectedPatientId ? { patientId: selectedPatientId } : {});
      this.setData({
        members,
        memberOptions,
        memberIndex,
        selectedPatientId,
        device: treatmentRes.data || null,
      });
    } catch (err) {
      console.error("加载阻鼾器管理失败", err);
      wx.showToast({ title: err.message || "加载阻鼾器失败", icon: "none" });
      this.setData({ device: null });
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

  goMenu(event) {
    const { url } = event.currentTarget.dataset;
    if (!url) return;
    wx.navigateTo({ url });
  },
});
