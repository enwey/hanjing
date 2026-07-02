"use strict";

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

const req = require("./request.js");

exports.addFamilyMember = async function (nData) {
  return req.request(
    {
      url: "/user/family-members",
      method: "POST",
      data: nData,
    }
  );
};

exports.applyWithdraw = async function (nAmount, method = "wechat", bankInfo = null) {
  return req.request(
    {
      url: "/distribution/withdraw",
      method: "POST",
      data: { amount: nAmount, method, bankInfo },
    }
  );
};

exports.cancelAppointment = async function (nId, oReason) {
  return req.request(
    {
      url: `/appointments/${nId}/cancel`,
      method: "POST",
      data: { reason: oReason },
    }
  );
};

exports.createAppointment = async function (nData) {
  return req.request(
    {
      url: "/appointments",
      method: "POST",
      data: nData,
    }
  );
};

exports.deleteFamilyMember = async function (oId) {
  return req.request(
    {
      url: `/user/family-members/${oId}`,
      method: "DELETE",
    }
  );
};

exports.getAccountSecurity = async function () {
  return req.request(
    {
      url: "/user/account-security",
      method: "GET",
    }
  );
};

exports.getAppointmentDetail = async function (nId) {
  return req.request(
    {
      url: `/appointments/${nId}`,
      method: "GET",
    }
  );
};

exports.getAppointments = async function (nQuery) {
  return req.request(
    {
      url: "/appointments",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getAssessments = async function () {
  return req.request(
    {
      url: "/assessments",
      method: "GET",
    }
  );
};

exports.getDeviceFeedback = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/device-feedback",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getDeviceMaintenance = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/device-maintenance",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getDistributionOrders = async function (nQuery) {
  return req.request(
    {
      url: "/distribution/orders",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getDistributionProducts = async function () {
  return req.request(
    {
      url: "/distribution/products",
      method: "GET",
    }
  );
};

exports.getDistributionRules = async function () {
  return req.request(
    {
      url: "/distribution/rules",
      method: "GET",
    }
  );
};

exports.getDistributionCommissionStats = async function () {
  return req.request(
    {
      url: "/distribution/commission-stats",
      method: "GET",
    }
  );
};

exports.getDistributionCommissions = async function () {
  return req.request(
    {
      url: "/distribution/commissions",
      method: "GET",
    }
  );
};

exports.uploadFile = async function (buffer, ext = 'jpg') {
  return req.request(
    {
      url: `/user/upload?ext=${ext}`,
      method: "POST",
      data: buffer,
      header: {
        "content-type": "application/octet-stream"
      }
    }
  );
};

exports.addMedicalAttachment = async function (id, url) {
  return req.request(
    {
      url: `/user/medical-records/${id}/attachments`,
      method: "POST",
      data: { url }
    }
  );
};

exports.sendPhoneCode = async function (phone) {
  return req.request(
    {
      url: "/user/send-code",
      method: "POST",
      data: { phone }
    }
  );
};

exports.changePhone = async function (phone, code) {
  return req.request(
    {
      url: "/user/change-phone",
      method: "POST",
      data: { phone, code }
    }
  );
};

exports.verifyRealName = async function (realName, idCard) {
  return req.request(
    {
      url: "/user/verify-realname",
      method: "POST",
      data: { realName, idCard }
    }
  );
};

exports.redeemCoupon = async function (couponId) {
  return req.request(
    {
      url: "/user/coupons/redeem",
      method: "POST",
      data: { couponId }
    }
  );
};

exports.getAvailableCoupons = async function () {
  return req.request(
    {
      url: "/user/coupons/available",
      method: "GET",
    }
  );
};

exports.getOrderLogistics = async function (orderId) {
  return req.request(
    {
      url: `/orders/${orderId}/logistics`,
      method: "GET",
    }
  );
};

exports.getDistributorInfo = async function () {
  return req.request(
    {
      url: "/distribution/info",
      method: "GET",
    }
  );
};

exports.getDistributionInviteInfo = async function () {
  return req.request(
    {
      url: "/distribution/invite-info",
      method: "GET",
    }
  );
};

exports.getDoctors = async function (nQuery) {
  return req.request(
    {
      url: "/doctors",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getESSQuestions = async function () {
  return req.request(
    {
      url: "/assessments/ess-questions",
      method: "GET",
    }
  );
};

exports.getFamilyMembers = async function () {
  return req.request(
    {
      url: "/user/family-members",
      method: "GET",
    }
  );
};

exports.getLiveRoomDetail = async function (oId) {
  return req.request(
    {
      url: `/live/rooms/${oId}`,
      method: "GET",
    }
  );
};

exports.getLiveRooms = async function () {
  return req.request(
    {
      url: "/live/rooms",
      method: "GET",
    }
  );
};

exports.getMedicalRecords = async function () {
  return req.request(
    {
      url: "/user/medical-records",
      method: "GET",
    }
  );
};

exports.getMemberInfo = async function () {
  return req.request(
    {
      url: "/user/member-info",
      method: "GET",
    }
  );
};

exports.getMemberLevels = async function () {
  return req.request(
    {
      url: "/user/member-levels",
      method: "GET",
    }
  );
};

exports.getNotifications = async function () {
  return req.request(
    {
      url: "/user/notifications",
      method: "GET",
    }
  );
};

exports.getOrders = async function (nQuery) {
  return req.request(
    {
      url: "/orders",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getOrderDetail = async function (oId) {
  return req.request(
    {
      url: `/orders/${oId}`,
      method: "GET",
    }
  );
};

exports.getProductDetail = async function (oId) {
  return req.request(
    {
      url: `/products/${oId}`,
      method: "GET",
    }
  );
};

exports.getProducts = async function (nQuery) {
  return req.request(
    {
      url: "/products",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getScheduleDates = async function (nQuery) {
  return req.request(
    {
      url: "/schedules/dates",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getSchedules = async function (nQuery) {
  return req.request(
    {
      url: "/schedules",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getSnoreAnalysis = async function (oId) {
  return req.request(
    {
      url: `/assessments/snore-analysis/${oId}`,
      method: "GET",
    }
  );
};

exports.getStores = async function (nQuery) {
  return req.request(
    {
      url: "/stores",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getUserCoupons = async function (nQuery) {
  return req.request(
    {
      url: "/user/coupons",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getTeamMembers = async function () {
  return req.request(
    {
      url: "/distribution/team",
      method: "GET",
    }
  );
};

exports.getTimeSlots = async function (nId) {
  return req.request(
    {
      url: `/schedules/${nId}/slots`,
      method: "GET",
    }
  );
};

exports.getTimeline = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/timeline",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getTreatmentRecord = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/record",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getTreatmentRecords = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/records",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getSleepReport = async function (query) {
  return req.request(
    {
      url: "/treatment/sleep-report",
      method: "GET",
      data: query
    }
  );
};

exports.getDeviceAdjustments = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/adjustments",
      method: "GET",
      data: nQuery
    }
  );
};

exports.getUserProfile = async function () {
  return req.request(
    {
      url: "/user/profile",
      method: "GET",
    }
  );
};

exports.getWearingRecords = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/wearing-records",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getWearingSummary = async function (nQuery) {
  return req.request(
    {
      url: "/treatment/wearing-summary",
      method: "GET",
      data: nQuery,
    }
  );
};

exports.getWithdrawRecords = async function () {
  return req.request(
    {
      url: "/distribution/withdraws",
      method: "GET",
    }
  );
};

exports.markAllNotificationsRead = async function () {
  return req.request(
    {
      url: "/user/notifications/read-all",
      method: "POST",
    }
  );
};

exports.markNotificationRead = async function (nId) {
  return req.request(
    {
      url: `/user/notifications/${nId}/read`,
      method: "POST",
    }
  );
};

exports.rescheduleAppointment = async function (nId, oData) {
  return req.request(
    {
      url: `/appointments/${nId}/reschedule`,
      method: "POST",
      data: oData,
    }
  );
};

exports.submitDeviceFeedback = async function (nData) {
  return req.request(
    {
      url: "/treatment/feedback",
      method: "POST",
      data: nData,
    }
  );
};

exports.submitESS = async function (nData) {
  return req.request(
    {
      url: "/assessments/ess",
      method: "POST",
      data: nData,
    }
  );
};

exports.submitSnoreRecording = async function (nData) {
  return req.request(
    {
      url: "/assessments/snore",
      method: "POST",
      data: nData,
    }
  );
};

exports.submitWearingCheckin = async function (nData) {
  return req.request(
    {
      url: "/treatment/wearing",
      method: "POST",
      data: nData,
    }
  );
};

exports.updateUserProfile = async function (nData) {
  return req.request(
    {
      url: "/user/profile",
      method: "PUT",
      data: nData,
    }
  );
};

exports.wxLogin = async function (nCode, phoneCode) {
  return req.request(
    {
      url: "/auth/wx-login",
      method: "POST",
      data: { code: nCode, phoneCode: phoneCode },
    }
  );
};

exports.getHomeStats = async function () {
  return req.request(
    {
      url: "/home/stats",
      method: "GET",
    }
  );
};

exports.getCommunityPosts = async function () {
  return req.request(
    {
      url: "/community/posts",
      method: "GET",
    }
  );
};

exports.getCommunityPostDetail = async function (id) {
  return req.request(
    {
      url: `/community/posts/${id}`,
      method: "GET",
    }
  );
};

exports.createCommunityPost = async function (data) {
  return req.request(
    {
      url: "/community/posts",
      method: "POST",
      data,
    }
  );
};

exports.likeCommunityPost = async function (id, isLiked) {
  return req.request(
    {
      url: `/community/posts/${id}/like`,
      method: "POST",
      data: { isLiked },
    }
  );
};

exports.commentCommunityPost = async function (id, content) {
  return req.request(
    {
      url: `/community/posts/${id}/comment`,
      method: "POST",
      data: { content },
    }
  );
};

exports.reportCommunityPost = async function (id, reason) {
  return req.request(
    {
      url: `/community/posts/${id}/report`,
      method: "POST",
      data: { reason },
    }
  );
};

exports.payAppointmentDeposit = async function (id) {
  return req.request(
    {
      url: `/appointments/${id}/pay`,
      method: "POST"
    }
  );
};

exports.confirmAppointmentPayment = async function (id) {
  return req.request(
    {
      url: `/appointments/${id}/confirm-pay`,
      method: "POST"
    }
  );
};

exports.submitAppointmentEvaluation = async function (id, data) {
  return req.request(
    {
      url: `/appointments/${id}/evaluation`,
      method: "POST",
      data
    }
  );
};

exports.getBookingSettings = async function () {
  return req.request(
    {
      url: "/settings/booking",
      method: "GET"
    }
  );
};

exports.createOrder = async function (data) {
  return req.request(
    {
      url: "/orders",
      method: "POST",
      data: data
    }
  );
};

exports.payOrder = async function (id) {
  return req.request(
    {
      url: `/orders/${id}/pay`,
      method: "POST"
    }
  );
};

exports.confirmOrderPayment = async function (id) {
  return req.request(
    {
      url: `/orders/${id}/confirm-pay`,
      method: "POST"
    }
  );
};

exports.cancelOrder = async function (id) {
  return req.request(
    {
      url: `/orders/${id}/cancel`,
      method: "POST"
    }
  );
};

exports.confirmReceipt = async function (id) {
  return req.request(
    {
      url: `/orders/${id}/confirm-receipt`,
      method: "POST"
    }
  );
};

exports.applyRefund = async function (id, data) {
  return req.request(
    {
      url: `/orders/${id}/refund`,
      method: "POST",
      data: data || {}
    }
  );
};

exports.bindDistribution = async function (inviteCode) {
  return req.request(
    {
      url: "/distribution/bind",
      method: "POST",
      data: { inviteCode }
    }
  );
};

exports.syncPendingSnoreRecordings = async function () {
  const pending = wx.getStorageSync('pending_snore_uploads') || [];
  if (pending.length === 0) return;
  console.log(`[PendingUploads] Found ${pending.length} pending uploads, starting silent sync...`);
  
  const remaining = [];
  for (const item of pending) {
    try {
      await exports.submitSnoreRecording(item);
      console.log(`[PendingUploads] Successfully synced pending record at timestamp: ${item.timestamp}`);
    } catch (err) {
      console.error(`[PendingUploads] Sync failed for record:`, err);
      remaining.push(item);
    }
  }
  wx.setStorageSync('pending_snore_uploads', remaining);
};
