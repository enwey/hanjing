const { request, apiBaseUrl } = require('../../../api/request');
const api = require('../../../api/index');

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
    subtitle: '如需预约、改约或咨询佩戴问题，可直接留言',
  };
}

Page({
  data: {
    hasLoaded: false,
    messages: [],
    inputText: '',
    scrollIntoView: '',
    serviceTitle: '在线客服',
    serviceSubtitle: '如需预约、改约或咨询佩戴问题，可直接留言',
  },

  onShow() {
    this.loadServiceIdentity();
    if (!this.data.hasLoaded) {
      this.fetchHistory();
    }
    this.connectSocket();
  },

  onHide() {
    this.disconnectSocket();
    this.stopPolling();
  },

  onUnload() {
    this.disconnectSocket();
    this.stopPolling();
  },

  async loadServiceIdentity() {
    try {
      const memberInfoResponse = await api.getMemberInfo().catch(() => null);
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
        displayUrl = apiBaseUrl + displayUrl;
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
        isImg: rawText.startsWith('[image]') || rawText.startsWith('/uploads/') || rawText.startsWith('http'),
        displayUrl,
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
    }));
  },

  async fetchHistory() {
    try {
      const res = await request({ url: '/im/messages' });
      if (res && res.code === 0 && Array.isArray(res.data)) {
        this.setData({ hasLoaded: true });
        this.setMessages(res.data.map((item) => ({
          id: String(item.id),
          from: item.sender === 'doctor' ? 'assistant' : 'user',
          text: item.text,
          time: item.time,
          status: 'success',
        })));
      }
    } catch (error) {
      console.error('fetchHistory error:', error);
    }
  },

  connectSocket() {
    const token = wx.getStorageSync('access_token');
    if (!token) return;
    const wsUrl = apiBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/im/ws?token=' + encodeURIComponent(token);
    this.socketTask = wx.connectSocket({ url: wsUrl, complete() {} });
    this.isSocketConnected = false;

    this.socketTask.onOpen(() => {
      this.isSocketConnected = true;
      this.stopPolling();
    });

    this.socketTask.onMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        if (data.type === 'pong') return;
        const messages = this.getMutableMessages();

        if (data.type === 'ack') {
          const found = messages.find((item) => item.text === data.text && item.status === 'sending');
          if (found) {
            found.id = String(data.id);
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

    this.socketTask.onClose(() => {
      this.isSocketConnected = false;
      this.startPolling();
    });

    this.socketTask.onError(() => {
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
    try {
      const response = await request({
        url: '/im/send',
        method: 'POST',
        data: { text: message.text },
      });
      message.status = response && response.code === 0 ? 'success' : 'fail';
      this.setMessages(this.getMutableMessages().map((item) => String(item.id) === String(message.id) ? message : item));
      if (message.status === 'success') {
        setTimeout(() => this.fetchHistory(), 1600);
      }
    } catch (error) {
      message.status = 'fail';
      this.setMessages(this.getMutableMessages().map((item) => String(item.id) === String(message.id) ? message : item));
    }
  },

  sendMsgWithRetry(message) {
    message.status = 'sending';
    const messages = this.getMutableMessages();
    const index = messages.findIndex((item) => String(item.id) === String(message.id));
    if (index >= 0) {
      messages[index] = message;
      this.setMessages(messages);
    }

    if (this.isSocketConnected && this.socketTask) {
      this.socketTask.send({
        data: JSON.stringify({ text: message.text }),
        fail: () => this.sendViaHttp(message),
      });
      return;
    }
    this.sendViaHttp(message);
  },

  sendMessage() {
    const text = String(this.data.inputText || '').trim();
    if (!text) return;
    const messages = this.getMutableMessages();
    const message = {
      id: String(Date.now()),
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
    if (message) {
      this.sendMsgWithRetry(message);
    }
  },

  onUploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const ext = tempFilePath.split('.').pop() || 'jpg';
        wx.showLoading({ title: '上传中...' });
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: tempFilePath,
          success: async (readRes) => {
            try {
              const uploadRes = await api.uploadFile(readRes.data, ext);
              if (uploadRes && uploadRes.code === 0 && uploadRes.data && uploadRes.data.url) {
                const message = {
                  id: String(Date.now()),
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
              wx.showToast({ title: '上传图片失败，请重试', icon: 'none' });
            } finally {
              wx.hideLoading();
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '读取文件失败', icon: 'none' });
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
