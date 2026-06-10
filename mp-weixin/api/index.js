"use strict";

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

const e = require("../mock/index.js");
const req = require("./request.js");

function t(data, delay = 200) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        code: 0,
        message: "success",
        data: data,
        timestamp: Date.now(),
      });
    }, delay);
  });
}

function n(errMessage) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(errMessage)), 200);
  });
}

exports.addFamilyMember = async function (nData) {
  return req.request(
    {
      url: "/user/family-members",
      method: "POST",
      data: nData,
    },
    () => {
      const o = { id: "fm-" + Date.now(), hasSnore: false, ...nData };
      e.mockFamilyMembers.push(o);
      return t(o);
    },
  );
};

exports.applyWithdraw = async function (nAmount) {
  return req.request(
    {
      url: "/distribution/withdraw",
      method: "POST",
      data: { amount: nAmount },
    },
    () => {
      const o = {
        id: "wd-" + Date.now(),
        userId: "user-001",
        amount: nAmount,
        fee: Math.round(0.001 * nAmount),
        actualAmount: Math.round(0.999 * nAmount),
        status: "pending",
        accountInfo: "微信零钱 ****8888",
        createdAt: new Date().toISOString(),
      };
      e.mockWithdrawRecords.unshift(o);
      e.mockDistributor.availableCommission -= nAmount;
      return t(o);
    },
  );
};

exports.cancelAppointment = async function (nId, oReason) {
  return req.request(
    {
      url: `/appointments/${nId}/cancel`,
      method: "POST",
      data: { reason: oReason },
    },
    () => {
      const r = e.mockAppointments.find((item) => item.id === nId);
      if (r) {
        r.status = "cancelled";
        r.cancelReason = oReason;
        r.cancelledAt = new Date().toISOString();
      }
      return t(r);
    },
  );
};

exports.createAppointment = async function (nData) {
  return req.request(
    {
      url: "/appointments",
      method: "POST",
      data: nData,
    },
    () => {
      const o = {
        id: "apt-" + Date.now(),
        appointmentNo:
          "AP" +
          new Date().toISOString().slice(0, 10).replace(/-/g, "") +
          String(Math.floor(1000 * Math.random())).padStart(3, "0"),
        userId: "user-001",
        status: "confirmed",
        source: "mini_app",
        ...nData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      e.mockAppointments.unshift(o);
      return t(o, 500);
    },
  );
};

exports.deleteFamilyMember = async function (oId) {
  return req.request(
    {
      url: `/user/family-members/${oId}`,
      method: "DELETE",
    },
    () => {
      const r = e.mockFamilyMembers.findIndex((item) => item.id === oId);
      if (r > -1) {
        e.mockFamilyMembers.splice(r, 1);
        return t(null);
      }
      return n("成员不存在");
    },
  );
};

exports.getAccountSecurity = async function () {
  return req.request(
    {
      url: "/user/account-security",
      method: "GET",
    },
    () => t(e.mockAccountSecurity),
  );
};

exports.getAppointmentDetail = async function (nId) {
  return req.request(
    {
      url: `/appointments/${nId}`,
      method: "GET",
    },
    () => {
      const o = e.mockAppointments.find((item) => item.id === nId);
      return t({
        appointment: o,
        doctor: o ? e.getDoctorById(o.doctorId) : undefined,
        store: o ? e.getStoreById(o.storeId) : undefined,
      });
    },
  );
};

exports.getAppointments = async function (nQuery) {
  return req.request(
    {
      url: "/appointments",
      method: "GET",
      data: nQuery,
    },
    () => {
      let o = e.getAppointmentsByUser("user-001");
      if (nQuery && nQuery.status) {
        o = o.filter((item) => item.status === nQuery.status);
      }
      return t(o);
    },
  );
};

exports.getAssessments = async function () {
  return req.request(
    {
      url: "/assessments",
      method: "GET",
    },
    () => t([...e.mockAssessments].reverse()),
  );
};

exports.getDeviceFeedback = async function () {
  return req.request(
    {
      url: "/treatment/device-feedback",
      method: "GET",
    },
    () =>
      t({ list: e.mockDeviceFeedbacks, total: e.mockDeviceFeedbacks.length }),
  );
};

exports.getDeviceMaintenance = async function () {
  return req.request(
    {
      url: "/treatment/device-maintenance",
      method: "GET",
    },
    () =>
      t({
        list: e.mockDeviceMaintenance,
        total: e.mockDeviceMaintenance.length,
      }),
  );
};

exports.getDistributionOrders = async function (nQuery) {
  return req.request(
    {
      url: "/distribution/orders",
      method: "GET",
      data: nQuery,
    },
    () => {
      const list = [...e.mockDistributionOrders];
      return t({ list, total: list.length });
    },
  );
};

exports.getDistributionProducts = async function () {
  return req.request(
    {
      url: "/distribution/products",
      method: "GET",
    },
    () =>
      t({
        list: e.mockDistributionProducts,
        total: e.mockDistributionProducts.length,
      }),
  );
};

exports.getDistributionRules = async function () {
  return req.request(
    {
      url: "/distribution/rules",
      method: "GET",
    },
    () => t({ rules: e.mockDistributionRules }),
  );
};

exports.getDistributorInfo = async function () {
  return req.request(
    {
      url: "/distribution/info",
      method: "GET",
    },
    () => t(e.mockDistributor),
  );
};

exports.getDoctors = async function (nQuery) {
  return req.request(
    {
      url: "/doctors",
      method: "GET",
      data: nQuery,
    },
    () => {
      let o = [...e.mockDoctors];
      if (nQuery && nQuery.storeId) {
        o = e.getDoctorsByStore(nQuery.storeId);
      }
      return t(o);
    },
  );
};

exports.getESSQuestions = async function () {
  return req.request(
    {
      url: "/assessments/ess-questions",
      method: "GET",
    },
    () => t(e.essQuestions),
  );
};

exports.getFamilyMembers = async function () {
  return req.request(
    {
      url: "/user/family-members",
      method: "GET",
    },
    () => t({ list: e.mockFamilyMembers, total: e.mockFamilyMembers.length }),
  );
};

exports.getLiveRoomDetail = async function (oId) {
  return req.request(
    {
      url: `/live/rooms/${oId}`,
      method: "GET",
    },
    () => {
      const r = e.mockLiveRooms.find((item) => item.id === oId);
      return r ? t(r) : n("直播不存在");
    },
  );
};

exports.getLiveRooms = async function () {
  return req.request(
    {
      url: "/live/rooms",
      method: "GET",
    },
    () => t({ list: e.mockLiveRooms, total: e.mockLiveRooms.length }),
  );
};

exports.getMedicalRecords = async function () {
  return req.request(
    {
      url: "/user/medical-records",
      method: "GET",
    },
    () => t({ list: e.mockMedicalRecords, total: e.mockMedicalRecords.length }),
  );
};

exports.getMemberInfo = async function () {
  return req.request(
    {
      url: "/user/member-info",
      method: "GET",
    },
    () => t(e.mockMemberInfo),
  );
};

exports.getMemberLevels = async function () {
  return req.request(
    {
      url: "/user/member-levels",
      method: "GET",
    },
    () => t(e.memberLevels),
  );
};

exports.getNotifications = async function () {
  return req.request(
    {
      url: "/user/notifications",
      method: "GET",
    },
    () =>
      t({
        list: e.mockNotifications,
        unread: e.mockNotifications.filter((item) => !item.isRead).length,
      }),
  );
};

exports.getOrderDetail = async function (oId) {
  return req.request(
    {
      url: `/orders/${oId}`,
      method: "GET",
    },
    () => {
      const r = e.mockOrders.find((item) => item.id === oId);
      return r ? t(r) : n("订单不存在");
    },
  );
};

exports.getProductDetail = async function (oId) {
  return req.request(
    {
      url: `/products/${oId}`,
      method: "GET",
    },
    () => {
      const r = e.mockProducts.find((item) => item.id === oId);
      return r ? t(r) : n("商品不存在");
    },
  );
};

exports.getProducts = async function (nQuery) {
  return req.request(
    {
      url: "/products",
      method: "GET",
      data: nQuery,
    },
    () => {
      const list = [...e.mockProducts];
      return t({ list, total: list.length });
    },
  );
};

exports.getScheduleDates = async function (nQuery) {
  return req.request(
    {
      url: "/schedules/dates",
      method: "GET",
      data: nQuery,
    },
    () => t(e.getScheduleDates(nQuery.doctorId, nQuery.storeId)),
  );
};

exports.getSchedules = async function (nQuery) {
  return req.request(
    {
      url: "/schedules",
      method: "GET",
      data: nQuery,
    },
    () =>
      t(
        e.getSchedulesByDateRange(
          nQuery.doctorId,
          nQuery.storeId,
          nQuery.startDate || "",
          nQuery.endDate || "",
        ),
      ),
  );
};

exports.getSnoreAnalysis = async function (oId) {
  return req.request(
    {
      url: `/assessments/snore-analysis/${oId}`,
      method: "GET",
    },
    () => {
      const r = e.mockAssessments.find((item) => item.id === oId);
      return r ? t(r) : n("评估记录不存在");
    },
  );
};

exports.getStores = async function (nQuery) {
  return req.request(
    {
      url: "/stores",
      method: "GET",
      data: nQuery,
    },
    () => {
      let o = [...e.mockStores];
      if (nQuery && nQuery.city) {
        o = o.filter((item) => item.city === nQuery.city);
      }
      return t(o);
    },
  );
};

exports.getTeamMembers = async function () {
  return req.request(
    {
      url: "/distribution/team",
      method: "GET",
    },
    () => t({ list: e.mockTeamMembers, total: e.mockTeamMembers.length }),
  );
};

exports.getTimeSlots = async function (nId) {
  return req.request(
    {
      url: `/schedules/${nId}/slots`,
      method: "GET",
    },
    () => {
      const o = e.getAllSchedules().find((item) => item.id === nId);
      if (!o) return Promise.reject({ code: 1004, message: "排班不存在" });
      return t(e.generateTimeSlots(o));
    },
  );
};

exports.getTimeline = async function () {
  return req.request(
    {
      url: "/treatment/timeline",
      method: "GET",
    },
    () => t(e.mockTimeline),
  );
};

exports.getTreatmentRecord = async function () {
  return req.request(
    {
      url: "/treatment/record",
      method: "GET",
    },
    () => t(e.mockTreatmentRecord),
  );
};

exports.getUserProfile = async function () {
  return req.request(
    {
      url: "/user/profile",
      method: "GET",
    },
    () => t(e.mockUserProfile),
  );
};

exports.getWearingRecords = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/wearing-records",
      method: "GET",
      data: nQuery,
    },
    () => t([...e.mockWearingRecords]),
  );
};

exports.getWearingSummary = async function () {
  return req.request(
    {
      url: "/treatment/wearing-summary",
      method: "GET",
    },
    () => t(e.getWearingSummary()),
  );
};

exports.getWithdrawRecords = async function () {
  return req.request(
    {
      url: "/distribution/withdraw-records",
      method: "GET",
    },
    () =>
      t({ list: e.mockWithdrawRecords, total: e.mockWithdrawRecords.length }),
  );
};

exports.markAllNotificationsRead = async function () {
  return req.request(
    {
      url: "/user/notifications/read-all",
      method: "POST",
    },
    () => {
      e.mockNotifications.forEach((item) => (item.isRead = true));
      return t(null);
    },
  );
};

exports.markNotificationRead = async function (nId) {
  return req.request(
    {
      url: `/user/notifications/${nId}/read`,
      method: "POST",
    },
    () => {
      const o = e.mockNotifications.find((item) => item.id === nId);
      if (o) o.isRead = true;
      return t(null);
    },
  );
};

exports.rescheduleAppointment = async function (nId, oData) {
  return req.request(
    {
      url: `/appointments/${nId}/reschedule`,
      method: "POST",
      data: oData,
    },
    () => {
      const r = e.mockAppointments.find((item) => item.id === nId);
      if (r) {
        r.scheduleId = oData.scheduleId;
        r.appointmentDate = oData.appointmentDate;
        r.appointmentTime = oData.appointmentTime;
        r.updatedAt = new Date().toISOString();
      }
      return t(r);
    },
  );
};

exports.submitDeviceFeedback = async function (nData) {
  return req.request(
    {
      url: "/treatment/feedback",
      method: "POST",
      data: nData,
    },
    () => {
      const o = {
        id: "df-new",
        date: new Date().toISOString().split("T")[0],
        ...nData,
      };
      e.mockDeviceFeedbacks.push(o);
      return t(o);
    },
  );
};

exports.submitESS = async function (nData) {
  return req.request(
    {
      url: "/assessments/ess",
      method: "POST",
      data: nData,
    },
    () => {
      const o = nData.answers.reduce((acc, val) => acc + val, 0);
      const r = e.getESSLevel(o);
      const s = {
        id: "asmt-" + Date.now(),
        userId: "user-001",
        patientId: nData.patientId || "pat-001",
        type: "ess",
        essAnswers: nData.answers,
        essScore: o,
        essLevel:
          o <= 5
            ? "normal"
            : o <= 10
              ? "mild"
              : o <= 15
                ? "moderate"
                : "severe",
        recommendation: r.advice,
        createdAt: new Date().toISOString(),
      };
      e.mockAssessments.push(s);
      return t(s, 800);
    },
  );
};

exports.submitSnoreRecording = async function (nData) {
  return req.request(
    {
      url: "/assessments/snore",
      method: "POST",
      data: nData,
    },
    () => {
      const o = e.getSnoreAnalysisResult();
      const r = e.getSnoreRiskInfo(o.riskLevel);
      const s = {
        id: "snore-" + Date.now(),
        userId: "user-001",
        patientId: "pat-001",
        type: "ai_snore",
        snoreRecordUrl: nData.filePath || "/static/demo/snore-demo.mp4",
        snoreAnalysis: o,
        recommendation: r.advice,
        createdAt: new Date().toISOString(),
      };
      e.mockAssessments.push(s);
      return t(s, 1500);
    },
  );
};

exports.submitWearingCheckin = async function (nData) {
  return req.request(
    {
      url: "/treatment/wearing",
      method: "POST",
      data: nData,
    },
    () => {
      const o = e.mockWearingRecords.find((item) => item.date === nData.date);
      if (o) {
        o.wearDuration = nData.wearDuration;
        o.comfort = nData.comfort;
        o.note = nData.note;
        return t(o);
      }
      const r = {
        id: "wear-" + nData.date,
        patientId: "pat-001",
        date: nData.date,
        wearDuration: nData.wearDuration,
        comfort: nData.comfort,
        note: nData.note,
        createdAt: new Date().toISOString(),
      };
      e.mockWearingRecords.push(r);
      return t(r);
    },
  );
};

exports.updateUserProfile = async function (nData) {
  return req.request(
    {
      url: "/user/profile",
      method: "PUT",
      data: nData,
    },
    () => {
      Object.assign(e.mockUserProfile, nData);
      return t(e.mockUserProfile);
    },
  );
};

exports.wxLogin = async function (nCode) {
  return req.request(
    {
      url: "/auth/wx-login",
      method: "POST",
      data: { code: nCode },
    },
    () => {
      return t({
        access_token: "mock_token_" + Date.now(),
        refresh_token: "mock_refresh_" + Date.now(),
        user: {
          id: "user-001",
          nickname: "张先生",
          avatar: "/static/demo/avatar.jpg",
          phone: "138****8888",
          memberLevel: "gold",
          isDistributor: false,
        },
        expires_in: 604800,
      });
    },
  );
};
