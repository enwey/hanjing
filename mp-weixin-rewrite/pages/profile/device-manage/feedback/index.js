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
    ratingOptions: [1, 2, 3, 4, 5],
    showComposer: false,
    rating: 0,
    content: "",
    submitting: false,
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
      const res = await api.getDeviceFeedback(selectedPatientId ? { patientId: selectedPatientId } : {});
      const records = (res.data && res.data.list) || res.list || [];
      this.setData({ members, memberOptions, memberIndex, selectedPatientId, records });
    } catch (err) {
      console.error("加载使用反馈失败", err);
      wx.showToast({ title: err.message || "加载使用反馈失败", icon: "none" });
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

  openComposer() {
    this.setData({ showComposer: true, rating: 0, content: "" });
  },

  closeComposer() {
    this.setData({ showComposer: false });
  },

  noop() {},

  chooseRating(event) {
    this.setData({ rating: Number(event.currentTarget.dataset.value || 0) });
  },

  onInputContent(event) {
    this.setData({ content: event.detail.value || "" });
  },

  async submitFeedback() {
    if (this.data.submitting) return;
    if (!this.data.rating) {
      wx.showToast({ title: "请选择评分", icon: "none" });
      return;
    }
    if (!String(this.data.content || "").trim()) {
      wx.showToast({ title: "请输入反馈内容", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.submitDeviceFeedback({
        patientId: this.data.selectedPatientId,
        rating: this.data.rating,
        content: this.data.content.trim(),
      });
      wx.showToast({ title: "提交成功", icon: "success" });
      this.setData({ showComposer: false, rating: 0, content: "" });
      await this.loadPage();
    } catch (err) {
      console.error("提交反馈失败", err);
      wx.showToast({ title: err.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
