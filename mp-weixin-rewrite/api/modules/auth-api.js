const { request } = require('../request');

function wxLogin(code, phoneCode) {
  return request({ url: '/auth/wx-login', method: 'POST', data: { code, phoneCode }, failMessage: '登录失败' });
}

function sendPhoneCode(phone) {
  return request({ url: '/user/send-code', method: 'POST', data: { phone }, failMessage: '发送验证码失败' });
}

function changePhone(phone, code) {
  return request({ url: '/user/change-phone', method: 'POST', data: { phone, code }, failMessage: '更换绑定手机失败' });
}

function verifyRealName(realName, idCard) {
  return request({ url: '/user/verify-realname', method: 'POST', data: { realName, idCard }, failMessage: '实名认证失败' });
}

module.exports = {
  wxLogin,
  sendPhoneCode,
  changePhone,
  verifyRealName
};
