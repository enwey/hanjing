"use strict";

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

const req = require("./request.js");

exports.addFamilyMember = async function (data) {
  return req.request(
    {
      url: "/user/family-members",
      method: "POST",
      data: data,
    }
  );
};

exports.applyWithdraw = async function (amount, method = "wechat", bankInfo = null) {
  return req.request(
    {
      url: "/distribution/withdraw",
      method: "POST",
      data: { amount, method, bankInfo },
    }
  );
};

exports.cancelAppointment = async function (id, reason) {
  return req.request(
    {
      url: `/appointments/${id}/cancel`,
      method: "POST",
      data: { reason },
    }
  );
};

exports.createAppointment = async function (data) {
  return req.request(
    {
      url: "/appointments",
      method: "POST",
      data: data,
    }
  );
};

exports.deleteFamilyMember = async function (id) {
  return req.request(
    {
      url: `/user/family-members/${id}`,
      method: "DELETE",
    }
  );
};

exports.getFamilyMemberDetail = async function (id) {
  return req.request(
    {
      url: `/user/family-members/${id}`,
      method: "GET",
    }
  );
};

exports.updateFamilyMember = async function (id, data) {
  return req.request(
    {
      url: `/user/family-members/${id}`,
      method: "PUT",
      data: data,
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

exports.getAppointmentDetail = async function (id) {
  return req.request(
    {
      url: `/appointments/${id}`,
      method: "GET",
    }
  );
};

exports.getAppointments = async function (query) {
  return req.request(
    {
      url: "/appointments",
      method: "GET",
      data: query,
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

exports.getDeviceFeedback = async function (query) {
  return req.request(
    {
      url: "/treatment/device-feedback",
      method: "GET",
      data: query,
    }
  );
};

exports.getDeviceMaintenance = async function (query) {
  return req.request(
    {
      url: "/treatment/device-maintenance",
      method: "GET",
      data: query,
    }
  );
};

exports.getDistributionOrders = async function (query) {
  return req.request(
    {
      url: "/distribution/orders",
      method: "GET",
      data: query,
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

exports.getDoctors = async function (query) {
  return req.request(
    {
      url: "/doctors",
      method: "GET",
      data: query,
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

exports.getLiveRoomDetail = async function (id) {
  return req.request(
    {
      url: `/live/rooms/${id}`,
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

exports.getOrders = async function (query) {
  return req.request(
    {
      url: "/orders",
      method: "GET",
      data: query,
    }
  );
};

exports.getOrderDetail = async function (id) {
  return req.request(
    {
      url: `/orders/${id}`,
      method: "GET",
    }
  );
};

exports.getProductDetail = async function (id) {
  return req.request(
    {
      url: `/products/${id}`,
      method: "GET",
    }
  );
};

exports.getProducts = async function (query) {
  return req.request(
    {
      url: "/products",
      method: "GET",
      data: query,
    }
  );
};

exports.getScheduleDates = async function (query) {
  return req.request(
    {
      url: "/schedules/dates",
      method: "GET",
      data: query,
    }
  );
};

exports.getSchedules = async function (query) {
  return req.request(
    {
      url: "/schedules",
      method: "GET",
      data: query,
    }
  );
};

exports.getSnoreAnalysis = async function (id) {
  return req.request(
    {
      url: `/assessments/snore-analysis/${id}`,
      method: "GET",
    }
  );
};

exports.getAssessmentDetail = async function (assessmentId) {
  return req.request(
    {
      url: `/assessments/snore-analysis/${assessmentId}`,
      method: "GET",
    }
  );
};

exports.getStores = async function (query) {
  return req.request(
    {
      url: "/stores",
      method: "GET",
      data: query,
    }
  );
};

exports.getUserCoupons = async function (query) {
  return req.request(
    {
      url: "/user/coupons",
      method: "GET",
      data: query,
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

exports.getTimeSlots = async function (id) {
  return req.request(
    {
      url: `/schedules/${id}/slots`,
      method: "GET",
    }
  );
};

exports.getTimeline = async function (query) {
  return req.request(
    {
      url: "/treatment/timeline",
      method: "GET",
      data: query,
    }
  );
};

exports.getTreatmentRecord = async function (query) {
  return req.request(
    {
      url: "/treatment/record",
      method: "GET",
      data: query,
    }
  );
};

exports.getTreatmentRecords = async function (query) {
  return req.request(
    {
      url: "/treatment/records",
      method: "GET",
      data: query,
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

exports.getDeviceAdjustments = async function (query) {
  return req.request(
    {
      url: "/treatment/adjustments",
      method: "GET",
      data: query
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

exports.getWearingRecords = async function (query) {
  return req.request(
    {
      url: "/treatment/wearing-records",
      method: "GET",
      data: query,
    }
  );
};

exports.getWearingSummary = async function (query) {
  return req.request(
    {
      url: "/treatment/wearing-summary",
      method: "GET",
      data: query,
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

exports.markNotificationRead = async function (id) {
  return req.request(
    {
      url: `/user/notifications/${id}/read`,
      method: "POST",
    }
  );
};

exports.rescheduleAppointment = async function (id, data) {
  return req.request(
    {
      url: `/appointments/${id}/reschedule`,
      method: "POST",
      data: data,
    }
  );
};

exports.submitDeviceFeedback = async function (data) {
  return req.request(
    {
      url: "/treatment/feedback",
      method: "POST",
      data: data,
    }
  );
};

exports.submitESS = async function (data) {
  return req.request(
    {
      url: "/assessments/ess",
      method: "POST",
      data: data,
    }
  );
};

exports.submitSnoreRecording = async function (data) {
  return req.request(
    {
      url: "/assessments/snore",
      method: "POST",
      data: data,
    }
  );
};

exports.submitWearingCheckin = async function (data) {
  return req.request(
    {
      url: "/treatment/wearing",
      method: "POST",
      data: data,
    }
  );
};

exports.updateUserProfile = async function (data) {
  return req.request(
    {
      url: "/user/profile",
      method: "PUT",
      data: data,
    }
  );
};

exports.wxLogin = async function (code, phoneCode) {
  return req.request(
    {
      url: "/auth/wx-login",
      method: "POST",
      data: { code: code, phoneCode: phoneCode },
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
