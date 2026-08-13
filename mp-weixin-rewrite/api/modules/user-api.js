const { request, apiBaseUrl } = require('../request');

function getUserProfile(options = {}) {
  return request({
    url: '/user/profile',
    method: 'GET',
    failMessage: '加载个人资料失败',
    traceId: options.traceId,
  });
}

function updateUserProfile(data) {
  return request({ url: '/user/profile', method: 'PUT', data, failMessage: '更新个人资料失败' });
}

function getFamilyMembers() {
  return request({ url: '/user/family-members', method: 'GET', failMessage: '加载家庭成员失败' });
}

function getFamilyMemberDetail(memberId) {
  return request({ url: '/user/family-members/' + memberId, method: 'GET', failMessage: '加载家庭成员详情失败' });
}

function addFamilyMember(data) {
  return request({ url: '/user/family-members', method: 'POST', data, failMessage: '添加家庭成员失败' });
}

function updateFamilyMember(memberId, data) {
  return request({ url: '/user/family-members/' + memberId, method: 'PUT', data, failMessage: '更新家庭成员失败' });
}

function deleteFamilyMember(memberId) {
  return request({ url: '/user/family-members/' + memberId, method: 'DELETE', failMessage: '删除家庭成员失败' });
}

function getMedicalRecords(query) {
  return request({ url: '/user/medical-records', method: 'GET', data: query, failMessage: '加载健康档案失败' });
}

function uploadFile(buffer, ext) {
  return request({ url: '/user/upload?ext=' + (ext || 'jpg'), method: 'POST', data: buffer, header: { 'content-type': 'application/octet-stream' }, failMessage: '上传文件失败' });
}

function uploadLocalFile(filePath, ext) {
  const accessToken = String(wx.getStorageSync('access_token') || '').trim();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: apiBaseUrl + '/user/upload?ext=' + encodeURIComponent(ext || 'jpg'),
      filePath,
      name: 'file',
      header: accessToken ? { Authorization: 'Bearer ' + accessToken } : {},
      success(result) {
        let payload = result.data;
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch (error) {}
        }
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(payload);
          return;
        }
        reject(new Error((payload && payload.message) || '上传文件失败'));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || '上传文件失败'));
      },
    });
  });
}

function addMedicalAttachment(recordId, url) {
  return request({ url: '/user/medical-records/' + recordId + '/attachments', method: 'POST', data: { url }, failMessage: '添加健康档案附件失败' });
}

function getMemberInfo() {
  return request({ url: '/user/member-info', method: 'GET', failMessage: '加载会员信息失败' });
}

function getMemberLevels() {
  return request({ url: '/user/member-levels', method: 'GET', failMessage: '加载会员等级规则失败' });
}

function getNotifications() {
  return request({ url: '/user/notifications', method: 'GET', failMessage: '加载通知消息失败' });
}

function getImUnreadCount() {
  return request({ url: '/im/unread-count', method: 'GET', failMessage: '加载客服未读消息失败' });
}

function markNotificationRead(notificationId) {
  return request({ url: '/user/notifications/' + notificationId + '/read', method: 'POST', failMessage: '标记消息已读失败' });
}

function markAllNotificationsRead() {
  return request({ url: '/user/notifications/read-all', method: 'POST', failMessage: '全部消息已读失败' });
}

function getAccountSecurity() {
  return request({ url: '/user/account-security', method: 'GET', failMessage: '加载账号安全信息失败' });
}

function sendPhoneCode(phone) {
  return request({ url: '/user/send-code', method: 'POST', data: { phone }, failMessage: '发送验证码失败' });
}

function changePhone(phone, code, phoneCode) {
  return request({ url: '/user/change-phone', method: 'POST', data: { phone, code, phoneCode }, failMessage: '更换手机号失败' });
}

function verifyRealName(realName, idCard) {
  return request({ url: '/user/verify-realname', method: 'POST', data: { realName, idCard }, failMessage: '实名认证失败' });
}

function redeemCoupon(couponId) {
  return request({ url: '/user/coupons/redeem', method: 'POST', data: { couponId }, failMessage: '兑换优惠券失败' });
}

function getAvailableCoupons() {
  return request({ url: '/user/coupons/available', method: 'GET', failMessage: '加载可用优惠券失败' });
}

function getUserCoupons(query) {
  return request({ url: '/user/coupons', method: 'GET', data: query, failMessage: '加载用户优惠券失败' });
}

module.exports = {
  getUserProfile,
  updateUserProfile,
  getFamilyMembers,
  getFamilyMemberDetail,
  addFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  getMedicalRecords,
  uploadFile,
  uploadLocalFile,
  addMedicalAttachment,
  getMemberInfo,
  getMemberLevels,
  getNotifications,
  getImUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  getAccountSecurity,
  sendPhoneCode,
  changePhone,
  verifyRealName,
  redeemCoupon,
  getAvailableCoupons,
  getUserCoupons
};
