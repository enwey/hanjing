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

const RECORD_TYPE_MAP = {
  first: { label: "初诊", color: "#3B6BF5" },
  followup: { label: "复诊", color: "#1A9D5C" },
  adjust: { label: "调整", color: "#F59E0B" },
};

function formatDateTimeText(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

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
    return wx.getStorageSync("selected_medical_record_patient_id") || "";
  },

  setStoragePatientId(patientId) {
    if (patientId) {
      wx.setStorageSync("selected_medical_record_patient_id", String(patientId));
    } else {
      wx.removeStorageSync("selected_medical_record_patient_id");
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
      const recordRes = await api.getMedicalRecords(selectedPatientId ? { patientId: selectedPatientId } : {});
      const rawRecords = (recordRes.data && recordRes.data.list) || recordRes.list || [];
      const records = rawRecords.map((item) => {
        const typeMeta = RECORD_TYPE_MAP[item.type] || RECORD_TYPE_MAP.first;
        return {
          id: String(item.id),
          patientName: item.patientName || "",
          visitDate: item.visitDate || "",
          visitDateText: formatDateTimeText(item.visitDate),
          doctorName: item.doctorName || "",
          hospital: item.hospital || item.storeName || "",
          diagnosis: item.diagnosis || "",
          prescription: item.prescription || "",
          note: item.note || "",
          typeLabel: typeMeta.label,
          typeColor: typeMeta.color,
          typeBg: `${typeMeta.color}18`,
        };
      });
      this.setData({
        hasLoaded: true,
        members,
        memberOptions,
        memberIndex,
        selectedPatientId,
        records,
        loading: false,
      });
    } catch (err) {
      console.error("加载病历档案失败", err);
      wx.showToast({ title: err.message || "加载病历档案失败", icon: "none" });
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
