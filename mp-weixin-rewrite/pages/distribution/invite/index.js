const inviteService = require('../../../services/invite-service');

const POSTER_CANVAS_ID = 'distributionInvitePoster';
const POSTER_WIDTH = 660;
const POSTER_HEIGHT = 960;

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

Page({
  data: { inviteCode: '', inviteQrCode: '', sharePath: '/pages/index/index', shareTitle: '邀请好友体验鼾静健康诊所', qrUnavailableNotice: '', isSavingPoster: false },
  async onShow() { await this.loadInviteInfo(); },
  async loadInviteInfo() {
    try {
      const inviteInfo = await inviteService.loadInviteShareInfo();
      this.setData({
        inviteCode: inviteInfo.inviteCode,
        inviteQrCode: inviteInfo.inviteQrCode,
        sharePath: inviteInfo.sharePath,
        shareTitle: inviteInfo.shareTitle,
        qrUnavailableNotice: inviteInfo.inviteQrCode ? '' : '当前环境未生成小程序码，将使用邀请码海报进行分享。',
      });
    } catch (error) {
      wx.showToast({ title: '加载邀请信息失败', icon: 'none' });
    }
  },
  handleCopyInviteCode() {
    if (!this.data.inviteCode) { wx.showToast({ title: '邀请码加载中', icon: 'none' }); return; }
    wx.setClipboardData({ data: this.data.inviteCode });
  },
  async handleSavePoster() {
    if (this.data.isSavingPoster) {
      return;
    }
    if (!this.data.inviteCode) {
      wx.showToast({ title: '邀请码加载中', icon: 'none' });
      return;
    }
    this.setData({ isSavingPoster: true });
    wx.showLoading({ title: '生成海报中', mask: true });
    try {
      const posterImagePath = await this.drawInvitePoster();
      await this.ensureAlbumPermission();
      await this.savePosterImage(posterImagePath);
      wx.showToast({ title: '海报已保存', icon: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : '保存海报失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isSavingPoster: false });
    }
  },
  async drawInvitePoster() {
    const context = wx.createCanvasContext(POSTER_CANVAS_ID, this);
    const qrImagePath = await this.resolvePosterQrImage();

    context.setFillStyle('#f4f6fb');
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    const cardX = 30;
    const cardY = 30;
    const cardWidth = POSTER_WIDTH - 60;
    const cardHeight = POSTER_HEIGHT - 60;
    const radius = 36;

    context.save();
    context.beginPath();
    context.moveTo(cardX + radius, cardY);
    context.lineTo(cardX + cardWidth - radius, cardY);
    context.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radius);
    context.lineTo(cardX + cardWidth, cardY + cardHeight - radius);
    context.quadraticCurveTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - radius, cardY + cardHeight);
    context.lineTo(cardX + radius, cardY + cardHeight);
    context.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - radius);
    context.lineTo(cardX, cardY + radius);
    context.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    context.closePath();
    context.clip();

    const gradient = context.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
    gradient.addColorStop(0, '#2f63f5');
    gradient.addColorStop(1, '#5c91ff');
    context.setFillStyle(gradient);
    context.fillRect(cardX, cardY, cardWidth, cardHeight);

    context.setFillStyle('rgba(255, 255, 255, 0.12)');
    context.beginPath();
    context.arc(cardX + cardWidth - 56, cardY + 92, 84, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(cardX + cardWidth - 8, cardY + 210, 132, 0, Math.PI * 2);
    context.fill();

    context.setFillStyle('rgba(255, 255, 255, 0.76)');
    context.setFontSize(18);
    context.fillText('鼾静健康 · 睡眠评估与治疗', 120, 108);
    context.setFillStyle('rgba(255, 255, 255, 0.92)');
    context.setFontSize(20);
    context.fillText('AI SLEEP CARE', 208, 154);
    context.setFillStyle('#ffffff');
    context.setFontSize(58);
    context.fillText('告别打鼾', 188, 248);
    context.setFontSize(34);
    context.fillText('让每一晚都睡得安稳', 150, 308);

    context.setFillStyle('rgba(255, 255, 255, 0.16)');
    drawRoundedRect(context, cardX + 72, 348, cardWidth - 144, 124, 26);
    context.fill();
    context.setFillStyle('#ffffff');
    context.setFontSize(18);
    context.fillText('推广给有睡眠困扰、打鼾、呼吸暂停问题的朋友', 112, 392);
    context.setFontSize(18);
    context.fillText('分享后对方进入小程序完成下单，系统自动记录邀请关系', 84, 428);

    context.setFillStyle('#ffffff');
    drawRoundedRect(context, 192, 514, 276, 276, 34);
    context.fill();

    if (qrImagePath) {
      context.drawImage(qrImagePath, 218, 540, 224, 224);
    } else {
      context.setFillStyle('#7e8fbe');
      context.setFontSize(24);
      context.fillText('邀请码', 294, 620);
      context.setFillStyle('#2f63f5');
      context.setFontSize(34);
      context.fillText(this.data.inviteCode, 228, 678);
    }

    context.setFillStyle('rgba(255, 255, 255, 0.14)');
    drawRoundedRect(context, 84, 822, cardWidth - 108, 72, 36);
    context.fill();
    context.setFillStyle('#ffffff');
    context.setFontSize(26);
    context.fillText('专属邀请码：' + this.data.inviteCode, 154, 868);

    context.restore();

    return new Promise((resolve, reject) => {
      context.draw(false, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: POSTER_CANVAS_ID,
            width: POSTER_WIDTH,
            height: POSTER_HEIGHT,
            destWidth: POSTER_WIDTH * 2,
            destHeight: POSTER_HEIGHT * 2,
            fileType: 'png',
            quality: 1,
            success: (result) => resolve(result.tempFilePath),
            fail: () => reject(new Error('海报生成失败')),
          }, this);
        }, 160);
      });
    });
  },
  async resolvePosterQrImage() {
    if (!this.data.inviteQrCode) {
      return '';
    }
    return new Promise((resolve) => {
      wx.getImageInfo({
        src: this.data.inviteQrCode,
        success: (result) => resolve(result.path || result.tempFilePath || ''),
        fail: () => resolve(''),
      });
    });
  },
  async ensureAlbumPermission() {
    const settings = await new Promise((resolve, reject) => {
      wx.getSetting({
        success: resolve,
        fail: reject,
      });
    });
    if (settings.authSetting && settings.authSetting['scope.writePhotosAlbum']) {
      return;
    }
    await new Promise((resolve, reject) => {
      wx.authorize({
        scope: 'scope.writePhotosAlbum',
        success: resolve,
        fail: reject,
      });
    }).catch(async () => {
      const modalResult = await new Promise((resolve) => {
        wx.showModal({
          title: '需要相册权限',
          content: '保存海报到手机相册前，需要您允许访问相册。',
          confirmText: '去开启',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        });
      });
      if (!modalResult.confirm) {
        throw new Error('未开启相册权限');
      }
      await new Promise((resolve) => {
        wx.openSetting({
          success: resolve,
          fail: resolve,
        });
      });
      const refreshedSettings = await new Promise((resolve, reject) => {
        wx.getSetting({
          success: resolve,
          fail: reject,
        });
      });
      if (!refreshedSettings.authSetting || !refreshedSettings.authSetting['scope.writePhotosAlbum']) {
        throw new Error('未开启相册权限');
      }
    });
  },
  async savePosterImage(filePath) {
    if (!filePath) {
      throw new Error('海报生成失败');
    }
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject,
      });
    });
  },
  onShareAppMessage() {
    return {
      title: this.data.shareTitle || '邀请好友体验鼾静健康诊所',
      path: this.data.sharePath || '/pages/index/index',
      imageUrl: '/static/images/distribution-invite-share-cover.png',
    };
  },
});
