const inviteService = require('./invite-service');

const POSTER_CANVAS_ID = 'distributionInvitePoster';
const POSTER_WIDTH = 900;
const POSTER_HEIGHT = 1360;
const POSTER_EXPORT_SCALE = 2;

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

function fillCenteredText(context, text, centerX, y, fontSize, color) {
  context.setFontSize(fontSize);
  context.setFillStyle(color);
  const content = String(text || '');
  const width = context.measureText(content).width;
  context.fillText(content, centerX - width / 2, y);
}

function fillWrappedText(context, text, x, y, maxWidth, lineHeight, color, fontSize) {
  const content = String(text || '');
  context.setFillStyle(color);
  context.setFontSize(fontSize);
  let line = '';
  let currentY = y;
  for (let i = 0; i < content.length; i += 1) {
    const nextLine = line + content[i];
    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = content[i];
      currentY += lineHeight;
    } else {
      line = nextLine;
    }
  }
  if (line) {
    context.fillText(line, x, currentY);
  }
  return currentY;
}

function createPosterContextAdapter(context) {
  let fontSize = 16;
  const applyFont = () => {
    context.font = `${fontSize}px sans-serif`;
    context.textBaseline = 'alphabetic';
  };
  applyFont();

  return {
    beginPath: () => context.beginPath(),
    moveTo: (x, y) => context.moveTo(x, y),
    lineTo: (x, y) => context.lineTo(x, y),
    quadraticCurveTo: (cpx, cpy, x, y) => context.quadraticCurveTo(cpx, cpy, x, y),
    closePath: () => context.closePath(),
    clip: () => context.clip(),
    save: () => context.save(),
    restore: () => context.restore(),
    fill: () => context.fill(),
    arc: (x, y, radius, startAngle, endAngle) => context.arc(x, y, radius, startAngle, endAngle),
    fillRect: (x, y, width, height) => context.fillRect(x, y, width, height),
    clearRect: (x, y, width, height) => context.clearRect(x, y, width, height),
    drawImage: (...args) => context.drawImage(...args),
    fillText: (text, x, y) => context.fillText(text, x, y),
    measureText: (text) => context.measureText(text),
    createLinearGradient: (x0, y0, x1, y1) => context.createLinearGradient(x0, y0, x1, y1),
    setTransform: (a, b, c, d, e, f) => context.setTransform(a, b, c, d, e, f),
    setFillStyle: (value) => { context.fillStyle = value; },
    setFontSize: (value) => { fontSize = value; applyFont(); },
  };
}

Page({
  data: { inviteCode: '', inviteQrCode: '', sharePath: '/pages/index/index', shareTitle: '邀请好友体验鼾静健康', qrUnavailableNotice: '', isSavingPoster: false, hasLoaded: false, posterWidth: POSTER_WIDTH, posterHeight: POSTER_HEIGHT },
  async onShow() { await this.loadInviteInfo({ silent: this.data.hasLoaded }); },
  async loadInviteInfo(options = {}) {
    try {
      const inviteInfo = await inviteService.loadInviteShareInfo();
      const qrNotice = inviteInfo.inviteQrCode
        ? ''
        : inviteInfo.inviteQrReason
          ? `当前环境未生成小程序码：${inviteInfo.inviteQrReason}。将使用邀请码海报进行分享。`
          : '当前环境未生成小程序码，将使用邀请码海报进行分享。';
      this.setData({
        hasLoaded: true,
        inviteCode: inviteInfo.inviteCode,
        inviteQrCode: inviteInfo.inviteQrCode,
        sharePath: inviteInfo.sharePath,
        shareTitle: inviteInfo.shareTitle,
        qrUnavailableNotice: qrNotice,
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
      wx.hideLoading();
      await this.showPosterSavedNotice();
    } catch (error) {
      const message = error && error.message ? error.message : '保存海报失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isSavingPoster: false });
    }
  },
  async drawInvitePoster() {
    const { canvas, context } = await this.getPosterCanvasContext();
    const qrImageSource = await this.resolvePosterQrImage();
    const qrImage = await this.loadPosterImage(canvas, qrImageSource);
    const inviteCode = this.data.inviteCode || '';
    const pageGradient = context.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    pageGradient.addColorStop(0, '#0a1529');
    pageGradient.addColorStop(0.6, '#11254c');
    pageGradient.addColorStop(1, '#0d1e3d');
    context.setFillStyle(pageGradient);
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    context.setFillStyle('rgba(16, 185, 129, 0.14)');
    context.beginPath();
    context.arc(POSTER_WIDTH - 60, 120, 190, 0, Math.PI * 2);
    context.fill();
    context.setFillStyle('rgba(99, 102, 241, 0.14)');
    context.beginPath();
    context.arc(80, POSTER_HEIGHT - 260, 220, 0, Math.PI * 2);
    context.fill();

    const posterX = 42;
    const posterY = 42;
    const posterWidth = POSTER_WIDTH - 84;
    const posterHeight = POSTER_HEIGHT - 84;

    context.save();
    drawRoundedRect(context, posterX, posterY, posterWidth, posterHeight, 42);
    context.clip();
    const posterGradient = context.createLinearGradient(posterX, posterY, posterX + posterWidth, posterY + posterHeight);
    posterGradient.addColorStop(0, '#09152a');
    posterGradient.addColorStop(0.6, '#11254c');
    posterGradient.addColorStop(1, '#0d1e3d');
    context.setFillStyle(posterGradient);
    context.fillRect(posterX, posterY, posterWidth, posterHeight);

    context.setFillStyle('rgba(255, 255, 255, 0.04)');
    context.beginPath();
    context.arc(posterX + posterWidth - 10, posterY + 120, 170, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(posterX - 20, posterY + posterHeight - 180, 210, 0, Math.PI * 2);
    context.fill();

    const contentX = posterX + 42;
    let currentY = posterY + 48;

    const logoGradient = context.createLinearGradient(contentX, currentY, contentX + 44, currentY + 44);
    logoGradient.addColorStop(0, '#10b981');
    logoGradient.addColorStop(1, '#3b82f6');
    context.setFillStyle(logoGradient);
    drawRoundedRect(context, contentX, currentY, 44, 44, 12);
    context.fill();
    context.setFillStyle('#ffffff');
    fillCenteredText(context, '月', contentX + 22, currentY + 30, 22, '#ffffff');

    context.setFillStyle('#ffffff');
    context.setFontSize(28);
    context.fillText('鼾静健康', contentX + 58, currentY + 20);
    context.setFillStyle('rgba(255, 255, 255, 0.52)');
    context.setFontSize(14);
    context.fillText('HANJING HEALTH', contentX + 58, currentY + 42);
    currentY += 86;

    const tagGradient = context.createLinearGradient(contentX, currentY, contentX + 220, currentY + 28);
    tagGradient.addColorStop(0, 'rgba(16, 185, 129, 0.12)');
    tagGradient.addColorStop(1, 'rgba(16, 185, 129, 0.06)');
    context.setFillStyle(tagGradient);
    drawRoundedRect(context, contentX, currentY, 220, 34, 17);
    context.fill();
    fillCenteredText(context, '✦ 睡眠健康管理伙伴 ✦', contentX + 110, currentY + 23, 16, '#10b981');
    currentY += 64;

    context.setFillStyle('#ffffff');
    context.setFontSize(62);
    context.fillText('邀请好友', contentX, currentY + 8);
    const titleGradient = context.createLinearGradient(contentX, currentY + 42, contentX + 420, currentY + 42);
    titleGradient.addColorStop(0, '#ffffff');
    titleGradient.addColorStop(1, '#93c5fd');
    context.setFillStyle(titleGradient);
    context.setFontSize(58);
    context.fillText('一起赚取推广佣金', contentX, currentY + 86);
    currentY += 126;

    currentY = fillWrappedText(
      context,
      '分享好眠，传递健康。好友通过您分享的链接或小程序码下单，系统将自动绑定邀请关系，并为您记录推广佣金。',
      contentX,
      currentY + 8,
      posterWidth - 84,
      36,
      '#94a3b8',
      22
    ) + 38;

    const processX = contentX;
    const processY = currentY;
    const processWidth = posterWidth - 84;
    const processHeight = 88;
    context.setFillStyle('rgba(255, 255, 255, 0.03)');
    drawRoundedRect(context, processX, processY, processWidth, processHeight, 18);
    context.fill();
    const stepCenters = [processX + 116, processX + processWidth / 2, processX + processWidth - 116];
    const stepTitles = ['分享此海报', '好友扫码下单', '绑定关系得佣金'];
    stepCenters.forEach((centerX, index) => {
      context.setFillStyle('rgba(255, 255, 255, 0.1)');
      context.beginPath();
      context.arc(centerX - 46, processY + processHeight / 2, 14, 0, Math.PI * 2);
      context.fill();
      fillCenteredText(context, String(index + 1), centerX - 46, processY + processHeight / 2 + 5, 12, '#ffffff');
      context.setFillStyle('#94a3b8');
      fillCenteredText(context, stepTitles[index], centerX + 18, processY + processHeight / 2 + 5, 18, '#94a3b8');
    });
    currentY += processHeight + 28;

    const targetX = contentX;
    const targetY = currentY;
    const targetWidth = posterWidth - 84;
    const targetHeight = 172;
    context.setFillStyle('rgba(255, 255, 255, 0.05)');
    drawRoundedRect(context, targetX, targetY, targetWidth, targetHeight, 24);
    context.fill();
    context.setFillStyle('rgba(255, 255, 255, 0.42)');
    context.setFontSize(16);
    context.fillText('适合分享给身边的朋友', targetX + 24, targetY + 30);

    const badges = [
      { text: '经常打鼾', color: '#fca5a5', bg: 'rgba(239, 68, 68, 0.08)', width: 108 },
      { text: '睡眠质量差', color: '#e2e8f0', bg: 'rgba(255,255,255,0.06)', width: 118 },
      { text: '呼吸暂停隐患', color: '#e2e8f0', bg: 'rgba(255,255,255,0.06)', width: 128 },
    ];
    let badgeX = targetX + 24;
    badges.forEach((badge) => {
      context.setFillStyle(badge.bg);
      drawRoundedRect(context, badgeX, targetY + 54, badge.width, 34, 10);
      context.fill();
      fillCenteredText(context, badge.text, badgeX + badge.width / 2, targetY + 77, 16, badge.color);
      badgeX += badge.width + 12;
    });
    context.setFillStyle('rgba(255, 255, 255, 0.1)');
    context.fillRect(targetX + 24, targetY + 116, targetWidth - 48, 1);
    context.setFillStyle('#10b981');
    context.beginPath();
    context.arc(targetX + 30, targetY + 140, 6, 0, Math.PI * 2);
    context.fill();
    context.setFillStyle('#cbd5e1');
    context.setFontSize(18);
    context.fillText('推荐体验：睡眠评估、定制化佩戴方案与健康服务', targetX + 46, targetY + 146);

    const actionCardX = contentX;
    const actionCardY = targetY + targetHeight + 44;
    const actionCardWidth = posterWidth - 84;
    const actionCardHeight = 238;
    context.setFillStyle('#ffffff');
    drawRoundedRect(context, actionCardX, actionCardY, actionCardWidth, actionCardHeight, 28);
    context.fill();

    context.setFillStyle('#0f172a');
    context.setFontSize(28);
    context.fillText('扫码立即体验', actionCardX + 32, actionCardY + 42);
    currentY = fillWrappedText(
      context,
      '进入小程序即可开启睡眠测试及专家预约服务。',
      actionCardX + 32,
      actionCardY + 82,
      360,
      30,
      '#64748b',
      19
    );

    context.setFillStyle('#f1f5f9');
    drawRoundedRect(context, actionCardX + 32, actionCardY + 124, 304, 70, 16);
    context.fill();
    context.setFillStyle('#94a3b8');
    context.setFontSize(14);
    context.fillText('专属邀请码', actionCardX + 52, actionCardY + 149);
    context.setFillStyle('#1e3a8a');
    context.setFontSize(32);
    context.fillText(inviteCode, actionCardX + 52, actionCardY + 181);

    const qrBoxSize = 138;
    const qrWrapX = actionCardX + actionCardWidth - qrBoxSize - 28;
    const qrWrapY = actionCardY + 24;
    context.setFillStyle('#ffffff');
    drawRoundedRect(context, qrWrapX, qrWrapY, qrBoxSize, qrBoxSize, 14);
    context.fill();
    context.setFillStyle('#e2e8f0');
    drawRoundedRect(context, qrWrapX, qrWrapY, qrBoxSize, qrBoxSize, 14);
    // subtle border via top strip and corners
    context.fillRect(qrWrapX, qrWrapY, qrBoxSize, 1);

    if (qrImage) {
      context.drawImage(qrImage, qrWrapX + 10, qrWrapY + 10, qrBoxSize - 20, qrBoxSize - 20);
    } else {
      context.setFillStyle('#f8fafc');
      drawRoundedRect(context, qrWrapX + 6, qrWrapY + 6, qrBoxSize - 12, qrBoxSize - 12, 10);
      context.fill();
      const patternStartX = qrWrapX + 14;
      const patternStartY = qrWrapY + 14;
      context.setFillStyle('#0f172a');
      for (let row = 0; row < 6; row += 1) {
        for (let col = 0; col < 6; col += 1) {
          if ((row + col) % 2 === 0 || (row === 0 && col < 2) || (col === 0 && row < 2)) {
            context.fillRect(patternStartX + col * 11, patternStartY + row * 11, 6, 6);
          }
        }
      }
      const qrLogoGradient = context.createLinearGradient(qrWrapX + 37, qrWrapY + 37, qrWrapX + 59, qrWrapY + 59);
      qrLogoGradient.addColorStop(0, '#10b981');
      qrLogoGradient.addColorStop(1, '#3b82f6');
      context.setFillStyle(qrLogoGradient);
      context.beginPath();
      context.arc(qrWrapX + 48, qrWrapY + 48, 12, 0, Math.PI * 2);
      context.fill();
      fillCenteredText(context, '月', qrWrapX + 48, qrWrapY + 53, 13, '#ffffff');
    }
    fillCenteredText(context, '微信扫码/长按识别', qrWrapX + qrBoxSize / 2, qrWrapY + qrBoxSize + 26, 14, '#94a3b8');

    fillCenteredText(context, '保存海报至相册，分享给好友或朋友圈即可推广', posterX + posterWidth / 2, actionCardY + actionCardHeight + 42, 14, 'rgba(255, 255, 255, 0.42)');
    context.restore();

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          destWidth: POSTER_WIDTH * POSTER_EXPORT_SCALE,
          destHeight: POSTER_HEIGHT * POSTER_EXPORT_SCALE,
          fileType: 'png',
          quality: 1,
          success: (result) => resolve(result.tempFilePath),
          fail: (error) => reject(new Error((error && error.errMsg) || '海报生成失败')),
        }, this);
      }, 120);
    });
  },
  async getPosterCanvasContext() {
    if (this.posterCanvas && this.posterContext) {
      this.resetPosterCanvas(this.posterCanvas, this.posterContext);
      return { canvas: this.posterCanvas, context: this.posterContext };
    }
    const query = wx.createSelectorQuery().in(this);
    const result = await new Promise((resolve, reject) => {
      query.select(`#${POSTER_CANVAS_ID}`).fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('海报画布初始化失败'));
          return;
        }
        resolve(res[0]);
      });
    });
    const canvas = result.node;
    const rawContext = canvas.getContext('2d');
    const context = createPosterContextAdapter(rawContext);
    this.posterCanvas = canvas;
    this.posterContext = context;
    this.resetPosterCanvas(canvas, context);
    return { canvas, context };
  },
  resetPosterCanvas(canvas, context) {
    const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1;
    canvas.width = POSTER_WIDTH * pixelRatio;
    canvas.height = POSTER_HEIGHT * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  },
  async resolvePosterQrImage() {
    if (!this.data.inviteQrCode) {
      return '';
    }
    const source = String(this.data.inviteQrCode || '').trim();
    if (!source) {
      return '';
    }
    const getLocalImage = (src) => new Promise((resolve) => {
      wx.getImageInfo({
        src,
        success: (result) => resolve(result.path || result.tempFilePath || src || ''),
        fail: () => resolve(''),
      });
    });

    if (!/^https?:\/\//i.test(source)) {
      return getLocalImage(source);
    }

    const downloadedPath = await new Promise((resolve) => {
      wx.downloadFile({
        url: source,
        success: (result) => {
          if (result.statusCode >= 200 && result.statusCode < 300) {
            resolve(result.tempFilePath || '');
            return;
          }
          resolve('');
        },
        fail: () => resolve(''),
      });
    });

    return downloadedPath || await getLocalImage(source);
  },
  async loadPosterImage(canvas, src) {
    const source = String(src || '').trim();
    if (!source) {
      return null;
    }

    if (canvas && typeof canvas.createImage === 'function') {
      const image = canvas.createImage();
      return new Promise((resolve) => {
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = source;
      });
    }

    return source;
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
  async showPosterSavedNotice() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '海报已保存',
        content: '已保存到系统相册，可以直接发给好友或朋友圈。',
        showCancel: false,
        confirmText: '知道了',
        success: resolve,
        fail: resolve,
      });
    });
  },
  onShareAppMessage() {
    return {
      title: this.data.shareTitle || '邀请好友体验鼾静健康',
      path: this.data.sharePath || '/pages/index/index',
      imageUrl: '/static/images/distribution-invite-share-cover.png',
    };
  },
});
