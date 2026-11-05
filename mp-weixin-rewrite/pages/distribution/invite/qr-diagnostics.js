function safeDetail(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, url => url.split(/[?#]/)[0])
    .replace(/((?:access_token|authorization|appsecret|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]')
    .slice(0, 500);
}
function environment(wxApi) {
  try {
    const info = wxApi.getAccountInfoSync().miniProgram || {};
    return `${info.envVersion || '未知'} / ${info.version || '未标注版本'}`;
  } catch { return '无法读取版本'; }
}
module.exports = { safeDetail, environment };
