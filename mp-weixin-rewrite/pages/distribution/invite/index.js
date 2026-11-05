const { safeDetail, environment } = require('./qr-diagnostics');
const { normalizeDistributionRules } = require('../utils/rules');
const api = require('../../../api/index');
const inviteService = require('./invite-service');
const { copy, drawInviteDesign } = require('./invite-design');
const subscribe = require('../../../common/utils/subscribe');

const POSTER_CANVAS_ID = 'distributionInvitePoster';
const POSTER_WIDTH = 900;
const POSTER_HEIGHT = 1064;
const POSTER_EXPORT_SCALE = 2;

function createPosterContextAdapter(context) {
  let fontSize = 16;
  let fontWeight = 400;
  const applyFont = () => {
    context.font = `${fontWeight} ${fontSize}px sans-serif`;
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
    setFontSize: (value, weight = 400) => { fontSize = value; fontWeight = weight; applyFont(); },
  };
}

Page({
  data: { qrDiagnosticText: '诊断版本：QR-20261105-1', qrChecking: false, shareImagePath: '', rulesLoading: true, rulesError: false, ruleSections: [], copy, isDistributor: false, inviteCode: '', inviteQrCode: '', sharePath: '/pages/index/index', shareTitle: copy.shareTitle, isSavingPoster: false, hasLoaded: false, posterWidth: POSTER_WIDTH, posterHeight: POSTER_HEIGHT },
  onReady() {
    this.canvasReady = true;
    if (this.data.inviteCode) this.prepareInviteImage().catch(() => {});
  },
  async prepareInviteImage() {
    if (!this.data.inviteQrCode) throw new Error('小程序码加载失败，请重新进入页面重试');
    const key = JSON.stringify([this.data.inviteCode, this.data.inviteQrCode]);
    if (this.imageKey === key && this.data.shareImagePath) return this.data.shareImagePath;
    if (this.imageFlight) {
      await this.imageFlight;
      return this.prepareInviteImage();
    }
    this.setData({ shareImagePath: '' });
    this.imageFlight = this.drawInvitePoster();
    try {
      const imagePath = await this.imageFlight;
      if (key === JSON.stringify([this.data.inviteCode, this.data.inviteQrCode])) {
        this.imageKey = key;
        this.setData({ shareImagePath: imagePath });
        return imagePath;
      }
    } finally {
      this.imageFlight = null;
    }
    return this.prepareInviteImage();
  },
  async onShow() { await Promise.all([this.loadInviteInfo({ silent: this.data.hasLoaded }), this.loadInviteRules()]); },
  addQrDiagnostic(stage, detail) {
    const line = `${stage}：${safeDetail(detail)}`;
    this.qrDiagnosticLines = [...(this.qrDiagnosticLines || []), line].slice(-16);
    this.setData({ qrDiagnosticText: this.qrDiagnosticLines.join('\n') });
  },
  handleCopyQrDiagnostic() {
    wx.setClipboardData({ data: this.data.qrDiagnosticText });
  },
  handleRetryQr() {
    return this.loadInviteInfo();
  },
  async loadInviteInfo(options = {}) {
    if (this.data.qrChecking) return;
    this.qrDiagnosticLines = [];
    this.setData({ qrChecking: true });
    this.addQrDiagnostic('诊断版本', 'QR-20261105-1');
    this.addQrDiagnostic('小程序版本', environment(wx));
    this.addQrDiagnostic('检查时间', new Date().toISOString());
    this.addQrDiagnostic('邀请接口', '请求中');
    try {
      const inviteInfo = await inviteService.loadInviteShareInfo();
      this.addQrDiagnostic('邀请接口', '请求成功');
      this.addQrDiagnostic('后台图片地址', inviteInfo.inviteQrCode || '未返回');
      if (!inviteInfo.inviteQrCode) this.addQrDiagnostic('后台生成结果', inviteInfo.inviteQrReason || '未提供失败原因，无法判断是否生成');
      this.qrRetryUsed = Boolean(options.qrRetry);
      let localQr = '';
      if (inviteInfo.inviteQrCode) {
        if (this.qrRemoteSource === inviteInfo.inviteQrCode && this.data.inviteQrCode) {
          localQr = await this.resolvePosterQrImage(this.data.inviteQrCode);
        }
        if (!localQr) localQr = await this.resolvePosterQrImage(inviteInfo.inviteQrCode);
        if (!localQr) localQr = await this.resolvePosterQrImage(inviteInfo.inviteQrCode);
      }
      this.addQrDiagnostic('码图获取结果', localQr ? '本地图片校验成功，等待页面显示' : '未取得可显示图片');
      this.qrRemoteSource = inviteInfo.inviteQrCode || '';
      this.setData({
        isDistributor: inviteInfo.isDistributor,
        hasLoaded: true,
        inviteCode: inviteInfo.inviteCode,
        inviteQrCode: localQr,
        sharePath: inviteInfo.sharePath,
        shareTitle: copy.shareTitle,
        shareImagePath: '',
      });
      if (localQr && this.canvasReady) this.prepareInviteImage().catch(() => {});
    } catch (error) {
      this.addQrDiagnostic('邀请接口异常', error && (error.errMsg || error.message) || '未知错误');
      wx.showToast({ title: '加载邀请信息失败', icon: 'none' });
    } finally {
      this.setData({ qrChecking: false });
    }
  },
  async loadInviteRules() {
    this.setData({ rulesLoading: true, rulesError: false });
    try {
      const response = await api.getDistributionRules();
      const payload = normalizeDistributionRules(response);
      const ruleSections = [
        { title: '开通条件', items: [payload.qualificationText || '当前暂无分销开通说明'] },
        { title: '佣金规则', items: payload.commissionRules },
        { title: '推广方式', items: payload.promotionWays },
        { title: '提现规则', items: payload.withdrawRules },
      ].filter(section => Array.isArray(section.items) && section.items.length);
      this.setData({ ruleSections, rulesLoading: false });
    } catch (error) {
      this.setData({ rulesLoading: false, rulesError: true });
    }
  },
  handleQrLoaded() {
    this.addQrDiagnostic('页面显示', '小程序码图片加载成功');
  },
  handleQrError(event) {
    this.addQrDiagnostic('页面显示失败', event && event.detail && event.detail.errMsg || 'image组件加载失败');
    this.setData({ inviteQrCode: '', shareImagePath: '' });
    if (!this.qrRetryUsed) {
      this.qrRetryUsed = true;
      this.loadInviteInfo({ qrRetry: true });
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
      const posterImagePath = await this.prepareInviteImage();
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
    if (!qrImage) throw new Error('小程序码加载失败，请重试');
    const brandImage = await this.loadPosterImage(canvas, '/static/images/brand-logo-v20261105.png');
    if (!brandImage) throw new Error('品牌图片加载失败，请重试');
    const artwork = await this.loadPosterImage(canvas, '/static/images/invite-sleep-letter.jpg');
    if (!artwork) throw new Error('海报图片加载失败，请重试');
    drawInviteDesign(context, { logo: brandImage, artwork, qr: qrImage, code: this.data.inviteCode || '' });

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
  async resolvePosterQrImage(qrSource = this.data.inviteQrCode) {
    if (!qrSource) {
      return '';
    }
    const source = String(qrSource || '').trim();
    if (!source) {
      return '';
    }
    const getLocalImage = (src) => new Promise((resolve) => {
      wx.getImageInfo({
        src,
        success: (result) => {
          this.addQrDiagnostic('图片校验', `成功，${result.width || '?'}×${result.height || '?'}`);
          resolve(result.path || result.tempFilePath || src || '');
        },
        fail: (error) => { this.addQrDiagnostic('图片校验失败', error.errMsg || '未知错误'); resolve(''); },
      });
    });

    if (!/^https?:\/\//i.test(source)) {
      return getLocalImage(source);
    }

    this.addQrDiagnostic('图片下载', source);
    const downloadedPath = await new Promise((resolve) => {
      wx.downloadFile({
        url: source,
        timeout: 10000,
        success: (result) => {
          this.addQrDiagnostic('图片HTTP状态', String(result.statusCode));
          if (result.statusCode >= 200 && result.statusCode < 300) {
            resolve(result.tempFilePath || '');
            return;
          }
          resolve('');
        },
        fail: (error) => { this.addQrDiagnostic('图片下载失败', error.errMsg || '未知错误'); resolve(''); },
      });
    });

    return downloadedPath ? await getLocalImage(downloadedPath) : await getLocalImage(source);
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
  handleShareInvite() {
    if (this.data.isDistributor) return;
    subscribe.requestSubscribe({ force: true, scene: 'distribution' }).catch(() => {});
  },
  onShareAppMessage() {
    return {
      title: copy.shareTitle,
      path: this.data.sharePath || '/pages/index/index',
      imageUrl: this.data.shareImagePath || '/static/images/distribution-invite-share-v20261105.jpg',
    };
  },
});
