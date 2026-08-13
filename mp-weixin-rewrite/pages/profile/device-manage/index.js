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

function normalizeDevice(record) {
  if (!record) return null;
  const sourceDevice = record.device || {};
  const name = sourceDevice.name || record.deviceName || record.deviceModel || "";
  const model = record.deviceModel || sourceDevice.model || name || "";
  if (!name && !model) return null;
  return {
    id: record.deviceProductId || sourceDevice.id || record.id || "",
    name: name || model,
    model,
    status: record.status === "active" || sourceDevice.status === "active" || sourceDevice.status === "bound" ? "active" : (record.status || sourceDevice.status || ""),
    serialNumber: record.serialNumber || sourceDevice.serialNumber || record.deviceProductId || sourceDevice.id || "",
    wearDays: 0,
    lastMaintenance: "",
    nextFollowup: record.nextFollowup || record.followupDate || record.nextAdjustDate || "",
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
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
        desc: "记录问题与建议，方便跟进",
        url: "/pages/profile/device-manage/feedback/index",
      },
    ],
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
      const [deviceRes, maintenanceRes, summaryRes] = await Promise.all([
        api.getPatientDevice(selectedPatientId ? { patientId: selectedPatientId } : {}),
        api.getDeviceMaintenance(selectedPatientId ? { patientId: selectedPatientId } : {}),
        api.getWearingSummary(selectedPatientId ? { patientId: selectedPatientId } : {}),
      ]);
      const device = normalizeDevice(deviceRes.data || deviceRes || null);
      if (device) {
        const maintenanceList = (maintenanceRes.data && maintenanceRes.data.list) || maintenanceRes.list || [];
        const summary = (summaryRes.data && Object.keys(summaryRes.data).length ? summaryRes.data : summaryRes) || {};
        device.lastMaintenance = maintenanceList[0] && maintenanceList[0].date ? maintenanceList[0].date : "";
        device.wearDays = Number(summary.wornDays || summary.weekWorn || 0);
      }
      this.setData({ hasLoaded: true, members, memberOptions, memberIndex, selectedPatientId, device, loading: false });
    } catch (err) {
      console.error("加载设备管理失败", err);
      wx.showToast({ title: err.message || "加载设备信息失败", icon: "none" });
      if (!this.data.hasLoaded) {
        this.setData({ device: null, loading: false });
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

  goMenu(event) {
    const { url } = event.currentTarget.dataset;
    if (url) {
      wx.navigateTo({ url });
    }
  },
});
