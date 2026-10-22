function capture(options) {
  const query=(options&&options.query)||{};
  let code=query.ref||'';
  try { const scene=decodeURIComponent(query.scene||'');const match=scene.match(/(?:^|&)ref=(BP[a-f0-9]{24})(?:&|$)/);if(match)code=match[1]; } catch(e) {}
  if(/^BP[a-f0-9]{24}$/.test(code))wx.setStorageSync('backend_referral',{code,expiresAt:Date.now()+7*24*60*60*1000});
}
function current() {
  const value=wx.getStorageSync('backend_referral');
  return value&&value.expiresAt>Date.now()&&/^BP[a-f0-9]{24}$/.test(value.code)?value.code:undefined;
}
function clear(code) {
  const value=wx.getStorageSync('backend_referral');
  if(value&&value.code===code)wx.removeStorageSync('backend_referral');
}
module.exports={capture,current,clear};
