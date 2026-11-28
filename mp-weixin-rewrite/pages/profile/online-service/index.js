const requestModule = require('../../../api/request');
const { request } = requestModule;
const { normalizeAssetUrl } = require('../../../common/config/asset-url');
const api = require('../../../api/index');
const sessionStore = require('../../../stores/session-store');

function resolveServiceIdentity(level) {
  const memberLevel = String(level || '');
  if (memberLevel === 'diamond') {
    return {
      title: '专属客服',
      subtitle: '已为您接入钻石会员 1v1 健康顾问服务',
    };
  }
  if (memberLevel === 'gold') {
    return {
      title: '专属客服',
      subtitle: '已为您接入黄金会员 1v1 健康顾问服务',
    };
  }
  return {
    title: '在线客服',
    subtitle: '如需预约、改约或咨询治疗问题，可直接留言',
  };
}

Page({
  data: {
    hasLoaded: false,
    messages: [],
    inputText: '',
    scrollIntoView: '',
    serviceTitle: '在线客服',
    serviceSubtitle: '如需预约、改约或咨询治疗问题，可直接留言',
    conversationLabel: '',
    accessError: '',
  },

  onLoad(options = {}) {
    this._accountGeneration = sessionStore.getLoginGeneration();
    this._patientId = options.patientId || '';
    if (options.topic === 'privacy-rights') {
      this.setData({ inputText: '我想申请账号注销或删除个人资料，请告知身份核验和处理流程。' });
    }
  },

  isCurrentAccount() {
    return !this._unloaded && this._accountGeneration === sessionStore.getLoginGeneration();
  },

  async onShow() {
    if (!this.isCurrentAccount()) {
      this.denyConversation();
      this.setData({ inputText: '', conversationLabel: '' });
      return;
    }
    this._visible=true;
    this.loadServiceIdentity();
    if(await this.fetchHistory() && this._visible)this.connectSocket();
  },

  onHide() {
    this._visible=false;
    this.disconnectSocket();
    this.stopPolling();
  },

  onUnload() {
    this._unloaded = true;
    this._visible=false;
    this.disconnectSocket();
    this.stopPolling();
  },

  async loadServiceIdentity() {
    try {
      const memberInfoResponse = await api.getMemberInfo().catch(() => null);
      if (!this.isCurrentAccount()) return;
      const memberInfo = memberInfoResponse && memberInfoResponse.code === 0
        ? memberInfoResponse.data
        : (memberInfoResponse && memberInfoResponse.data) || memberInfoResponse || {};
      const identity = resolveServiceIdentity(memberInfo.currentLevel || memberInfo.memberLevel || memberInfo.level || '');
      this.setData({
        serviceTitle: identity.title,
        serviceSubtitle: identity.subtitle,
      });
    } catch (error) {}
  },

  setMessages(messages) {
    const normalized = messages.map((item) => {
      const rawText = String(item.text || '');
      let displayUrl = rawText.startsWith('[image]') ? rawText.slice(7) : rawText;
      if (displayUrl && !displayUrl.startsWith('http') && displayUrl.startsWith('/uploads')) {
        displayUrl = requestModule.apiBaseUrl.replace(/\/api\/v1\/?$/, '') + displayUrl;
      }
      return {
        id: String(item.id || ''),
        from: item.from,
        bubbleClass: item.from,
        rowClass: item.from,
        text: rawText,
        time: item.time || '',
        sending: item.status === 'sending',
        failed: item.status === 'fail',
        awaitingHistory: Boolean(item.awaitingHistory),
        isImg: rawText.startsWith('[image]'),
        displayUrl: normalizeAssetUrl(displayUrl, requestModule.apiBaseUrl),
      };
    });
    const last = normalized[normalized.length - 1];
    this.setData({
      messages: normalized,
      scrollIntoView: last ? 'msg-' + last.id : '',
    });
  },

  getMutableMessages() {
    return (this.data.messages || []).map((item) => ({
      id: item.id,
      from: item.from,
      text: item.text,
      time: item.time,
      status: item.failed ? 'fail' : (item.sending ? 'sending' : 'success'),
      awaitingHistory: item.awaitingHistory,
    }));
  },

  async fetchHistory() {
    if (!this.isCurrentAccount()) return false;
    const revision = this._historyRevision = (this._historyRevision || 0) + 1;
    try {
      const res = await request({ url: '/im/messages',data:this._patientId?{patientId:this._patientId}:{} });
      if (!this.isCurrentAccount() || revision !== this._historyRevision) return false;
      if (res && res.code === 0 && Array.isArray(res.data)) {
        this.setData({ hasLoaded: true,accessError:'',conversationLabel:res.conversation ? '就诊人：'+res.conversation.patientName : '' });
        const history = res.data.map((item) => ({
          id: String(item.id),
          from: item.sender === 'doctor' ? 'assistant' : 'user',
          text: item.text,
          time: item.time,
          status: 'success',
        }));
        const confirmed = new Set(history.map(item => item.id));
        const unsynced = this.getMutableMessages().filter(item => !confirmed.has(item.id)
          && (item.status === 'sending' || item.status === 'fail' || item.awaitingHistory));
        this.setMessages(history.concat(unsynced));
        return true;
      }
    } catch (error) {
      if (!this.isCurrentAccount() || revision !== this._historyRevision) return false;
      console.error('fetchHistory error:', error);
      if([401,403,404].includes(Number(error.statusCode || error.status || error.code)))this.denyConversation();
    }
    return false;
  },

  denyConversation() {
    this._historyRevision = (this._historyRevision || 0) + 1;
    this.setData({messages:[],accessError:'该会话已不存在或您无权访问'});
    this.stopPolling();this.disconnectSocket();
  },

  connectSocket() {
    if (!this.isCurrentAccount()) return;
    const token = sessionStore.getAccessToken();
    if (!token || this.data.accessError || this.socketTask) return;
    const wsUrl = requestModule.apiBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/im/ws?token=' + encodeURIComponent(token)+(this._patientId?'&patientId='+encodeURIComponent(this._patientId):'');
    this.socketTask = wx.connectSocket({ url: wsUrl, complete() {} });
    const task=this.socketTask;
    this.isSocketConnected = false;

    this.socketTask.onOpen(() => {
      if(this.socketTask!==task)return;
      this.isSocketConnected = true;
      this.stopPolling();
    });

    this.socketTask.onMessage((res) => {
      if(this.socketTask!==task)return;
      try {
        if (!this.isCurrentAccount()) return;
        const data = JSON.parse(res.data);
        if (data.type === 'pong') return;
        if(data.type==='error'){wx.showToast({title:data.message || '发送失败',icon:'none'});return;}
        const messages = this.getMutableMessages();

        if (data.type === 'ack') {
          const found = messages.find((item) => item.text === data.text && item.status === 'sending');
          if (found) {
            found.id = String(data.id);
            found.awaitingHistory = true;
            found.status = 'success';
            found.time = data.time;
          }
        } else if (data.type === 'message') {
          const duplicated = messages.some((item) => String(item.id) === String(data.id));
          if (!duplicated) {
            messages.push({
              id: String(data.id),
              from: data.from,
              text: data.text,
              time: data.time,
              status: 'success',
            });
          }
        }
        this.setMessages(messages);
      } catch (error) {
        console.error('[WebSocket] message error:', error);
      }
    });

    this.socketTask.onClose((event) => {
      if(this.socketTask!==task)return;
      this.isSocketConnected = false;
      this.socketTask=null;
      if(event && event.code===1008){this.denyConversation();return;}
      this.startPolling();
    });

    this.socketTask.onError(() => {
      if(this.socketTask!==task)return;
      this.isSocketConnected = false;
      this.startPolling();
    });
  },

  disconnectSocket() {
    if (this.socketTask) {
      this.socketTask.close();
      this.socketTask = null;
    }
    this.isSocketConnected = false;
  },

  startPolling() {
    this.stopPolling();
    if(!this._visible || this.data.accessError)return;
    this.pollTimer = setInterval(() => this.fetchHistory(), 4000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  handleInput(event) {
    this.setData({ inputText: event.detail.value || '' });
  },

  async sendViaHttp(message) {
    if (!this.isCurrentAccount() || this.data.accessError) return;
    try {
      const response = await request({
        url: '/im/send',
        method: 'POST',
        data: { text: message.text,...(this._patientId?{patientId:this._patientId}:{}) },
      });
      if (!this.isCurrentAccount() || this.data.accessError) return;
      message.status = response && response.code === 0 ? 'success' : 'fail';
      const serverId = message.status === 'success' && response.data?.id ? String(response.data.id) : '';
      const messages = this.getMutableMessages();
      const confirmed = serverId && messages.some(item => item.id === serverId && !item.awaitingHistory);
      this.setMessages(messages.flatMap(item => {
        if (item.id !== message.id) return [item];
        if (confirmed) return [];
        return [{ ...message, id: serverId || message.id, awaitingHistory: Boolean(serverId) }];
      }));
      if (message.status === 'success') {
        setTimeout(() => this.fetchHistory(), 1600);
      }
    } catch (error) {
      if (!this.isCurrentAccount() || this.data.accessError) return;
      if([401,403,404].includes(Number(error.statusCode || error.status || error.code))){this.denyConversation();return;}
      message.status = 'fail';
      this.setMessages(this.getMutableMessages().map((item) => String(item.id) === String(message.id) ? message : item));
    }
  },

  sendMsgWithRetry(message) {
    if (!this.isCurrentAccount() || this.data.accessError) return;
    message.status = 'sending';
    const messages = this.getMutableMessages();
    const index = messages.findIndex((item) => String(item.id) === String(message.id));
    if (index >= 0) {
      messages[index] = message;
      this.setMessages(messages);
    }

    // A protected image needs its own HTTP response to mark the exact message failed.
    if (!message.text.startsWith('[image]') && this.isSocketConnected && this.socketTask) {
      this.socketTask.send({
        data: JSON.stringify({ text: message.text }),
        fail: () => this.sendViaHttp(message),
      });
      return;
    }
    return this.sendViaHttp(message);
  },

  nextLocalMessageId() {
    this._localMessageSequence = (this._localMessageSequence || 0) + 1;
    return 'local-' + this._localMessageSequence;
  },

  sendMessage() {
    if (!this.isCurrentAccount()) return;
    if(this.data.accessError){wx.showToast({title:this.data.accessError,icon:'none'});return;}
    const text = String(this.data.inputText || '').trim();
    if (!text) return;
    const messages = this.getMutableMessages();
    const message = {
      id: this.nextLocalMessageId(),
      from: 'user',
      text,
      time: new Date().toTimeString().slice(0, 5),
      status: 'sending',
    };
    messages.push(message);
    this.setData({ inputText: '' });
    this.setMessages(messages);
    this.sendMsgWithRetry(message);
  },

  retrySendMessage(event) {
    const id = String(event.currentTarget.dataset.id || '');
    const message = this.getMutableMessages().find((item) => String(item.id) === id);
    if (message) return this.sendMsgWithRetry(message);
  },

  onUploadImage() {
    if (!this.isCurrentAccount()) return;
    if (this.data.accessError) {
      wx.showToast({ title: this.data.accessError, icon: 'none' });
      return;
    }
    wx.showModal({
      title: '发送咨询图片',
      content: '图片会发送至诊所客服，用于处理本次咨询。请先遮盖与咨询无关的身份证号码、病历及其他个人信息。',
      confirmText: '选择图片',
      success: ({ confirm }) => {
        if (confirm) this.chooseConsultationImage();
      },
    });
  },

  chooseConsultationImage() {
    if (!this.isCurrentAccount() || this.data.accessError) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles?.[0]?.tempFilePath;
        if (!tempFilePath || !this.isCurrentAccount() || this.data.accessError) return;
        const ext = tempFilePath.split('.').pop() || 'jpg';
        wx.showLoading({ title: '上传中...' });
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: tempFilePath,
          success: async (readRes) => {
            try {
              if (!this.isCurrentAccount() || this.data.accessError) return;
              const uploadRes = await api.uploadFile(readRes.data, ext);
              if (!this.isCurrentAccount() || this.data.accessError) return;
              if (uploadRes && uploadRes.code === 0 && uploadRes.data && uploadRes.data.url) {
                const message = {
                  id: this.nextLocalMessageId(),
                  from: 'user',
                  text: '[image]' + uploadRes.data.url,
                  time: new Date().toTimeString().slice(0, 5),
                  status: 'sending',
                };
                const messages = this.getMutableMessages();
                messages.push(message);
                this.setMessages(messages);
                this.sendMsgWithRetry(message);
              } else {
                wx.showToast({ title: '上传图片失败', icon: 'none' });
              }
            } catch (error) {
              if (this.isCurrentAccount()) wx.showToast({ title: '上传图片失败，请重试', icon: 'none' });
            } finally {
              wx.hideLoading();
            }
          },
          fail: () => {
            wx.hideLoading();
            if (this.isCurrentAccount()) wx.showToast({ title: '读取文件失败', icon: 'none' });
          },
        });
      },
    });
  },

  onPreviewImage(event) {
    const src = String(event.currentTarget.dataset.src || '');
    if (!src) return;
    wx.previewImage({
      urls: [src],
      current: src,
    });
  },
});
