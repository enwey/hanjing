const copy = {
  title: '告别打鼾',
  subtitle: '让每一晚都睡得安稳',
  shareTitle: '告别打鼾，让每一晚都睡得安稳',
};

// Page, exported poster and share cover use the same copy and visual palette.
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function drawInviteDesign(ctx, { logo, artwork, qr, code = '' }) {
  const text = (value, x, y, size, color, weight = 400) => {
    ctx.setFillStyle(color); ctx.setFontSize(size, weight); ctx.fillText(value, x, y);
  };
  const logoAt = (x, y, size) => {
    ctx.save(); rounded(ctx, x, y, size, size, size * .24); ctx.clip();
    ctx.drawImage(logo, x, y, size, size); ctx.restore();
  };
  // Match the page hero's 702:830 ratio and aspectFill crop.
  ctx.setFillStyle('#dcece5'); ctx.fillRect(0, 0, 900, 1064);
  ctx.drawImage(artwork, 0, -31, 900, 1126);
  logoAt(41, 41, 77); text('兴康明', 136, 96, 36, '#2a52d4', 600);
  text(copy.title, 41, 237, 90, '#2a52d4', 700);
  text(copy.subtitle, 41, 320, 44, '#2a52d4', 500);
  if (qr) {
    ctx.setFillStyle('#ffffff'); rounded(ctx, 652, 816, 216, 216, 20); ctx.fill();
    ctx.drawImage(qr, 668, 832, 184, 184);
  } else if (code) {
    ctx.setFillStyle('#ffffff'); rounded(ctx, 500, 900, 368, 132, 20); ctx.fill();
    text('邀请码', 524, 946, 24, '#6b7280');
    text(code, 524, 996, 30, '#2a52d4');
  }
}
module.exports = { copy, drawInviteDesign };
