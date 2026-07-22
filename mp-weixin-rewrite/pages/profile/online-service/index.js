const requestModule = require('../../../api/request');
const api = require('../../../api/index');

function formatMessage(message) {
  const text = message.text || '';
  const isImage = text.indexOf('[image]') === 0;
  const displayUrl = isImage ? text.replace('[image]', '') : '';
  return {
    id: String(message.id || Date.now()),
    from: message.sender === 'doctor' || message.from === 'assistant' ? 'assistant' : 'user',
    bubbleClass: message.sender === 'doctor' || message.from === 'assistant' ? 'assistant' : 'user',
    text: isImage ? '' : text,
    displayUrl,
    isImage,
    time: message.time || '',
    sending: message.status === 'sending',
    failed: message.status === 'fail',
  };
}

Page({
  data: {
    messages: [],
    draftMessage: '',
    scrollIntoView: '',
  },

  onShow() {
    this.fetchHistory();
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

  fetchHistory() {
    requestModule.request({ url: '/im/messages', failMessage: '加载咨询记录失败' })
      .then((response) => {
        const payload = (response && response.data) || response || [];
        const messages = payload.map(formatMessage);
        this.setData({
          messages,
          scrollIntoView: messages.length ? 'message-' + messages[messages.length - 1].id : '',
        });
      })
      .catch((error) => {
        console.error('fetchHistory error', error);
      });
  },

  connectSocket() {
    const token = wx.getStorageSync('access_token');
    if (!token) return;
    const wsUrl = requestModule.apiBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/im/ws?token=' + encodeURIComponent(token);
    this.socketTask = wx.connectSocket({ url: wsUrl });
    this.socketConnected = false;

    this.socketTask.onOpen(() => {
      this.socketConnected = true;
      this.stopPolling();
    });

    this.socketTask.onMessage((event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'pong') return;
        if (payload.type === 'ack') {
          const messages = this.data.messages.map((message) => {
            if (message.sending && message.text === payload.text) {
              return Object.assign({}, message, {
                id: String(payload.id || message.id),
                time: payload.time || message.time,
                sending: false,
                failed: false,
              });
            }
            return message;
          });
          this.setData({ messages });
          return;
        }
        if (payload.type === 'message') {
          const exists = this.data.messages.some((message) => String(message.id) === String(payload.id));
          if (!exists) {
            const nextMessages = this.data.messages.concat([formatMessage(payload)]);
            this.setData({
              messages: nextMessages,
              scrollIntoView: 'message-' + payload.id,
            });
          }
        }
      } catch (error) {
        console.error('socket message error', error);
      }
    });

    this.socketTask.onClose(() => {
      this.socketConnected = false;
      this.startPolling();
    });

    this.socketTask.onError(() => {
      this.socketConnected = false;
      this.startPolling();
    });
  },

  disconnectSocket() {
    if (this.socketTask) {
      this.socketTask.close();
      this.socketTask = null;
    }
    this.socketConnected = false;
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

  handleDraftInput(event) {
    this.setData({ draftMessage: event.detail.value || '' });
  },

  sendMessage() {
    const text = String(this.data.draftMessage || '').trim();
    if (!text) return;

    const tempId = String(Date.now());
    const pendingMessage = {
      id: tempId,
      from: 'user',
      bubbleClass: 'user',
      text,
      displayUrl: '',
      isImage: false,
      time: new Date().toTimeString().slice(0, 5),
      sending: true,
      failed: false,
    };
    const messages = this.data.messages.concat([pendingMessage]);
    this.setData({
      messages,
      draftMessage: '',
      scrollIntoView: 'message-' + tempId,
    });

    this.sendMessageWithRetry(pendingMessage);
  },

  sendMessageWithRetry(message) {
    if (this.socketConnected && this.socketTask) {
      this.socketTask.send({
        data: JSON.stringify({ text: message.isImage ? '[image]' + message.displayUrl : message.text }),
        fail: () => this.sendViaHttp(message),
      });
      return;
    }
    this.sendViaHttp(message);
  },

  sendViaHttp(message) {
    requestModule.request({
      url: '/im/send',
      method: 'POST',
      data: { text: message.isImage ? '[image]' + message.displayUrl : message.text },
      failMessage: '发送消息失败',
    }).then(() => {
      setTimeout(() => this.fetchHistory(), 1200);
    }).catch(() => {
      const messages = this.data.messages.map((item) => {
        if (item.id === message.id) {
          return Object.assign({}, item, { sending: false, failed: true });
        }
        return item;
      });
      this.setData({ messages });
    });
  },

  retrySendMessage(event) {
    const messageId = event.currentTarget.dataset.id;
    const message = this.data.messages.find((item) => item.id === messageId);
    if (!message) return;
    const messages = this.data.messages.map((item) => item.id === messageId ? Object.assign({}, item, { sending: true, failed: false }) : item);
    this.setData({ messages });
    this.sendMessageWithRetry(message);
  },

  onUploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (chooseResult) => {
        const tempFilePath = chooseResult.tempFiles[0].tempFilePath;
        const ext = tempFilePath.split('.').pop() || 'jpg';
        wx.showLoading({ title: '上传中...' });
        wx.getFileSystemManager().readFile({
          filePath: tempFilePath,
          success: async (readResult) => {
            try {
              const uploadResponse = await api.uploadFile(readResult.data, ext);
              const payload = (uploadResponse && uploadResponse.data) || uploadResponse || {};
              if (!payload.url) {
                throw new Error('上传图片失败');
              }
              const tempId = String(Date.now());
              const pendingMessage = {
                id: tempId,
                from: 'user',
                bubbleClass: 'user',
                text: '',
                displayUrl: payload.url,
                isImage: true,
                time: new Date().toTimeString().slice(0, 5),
                sending: true,
                failed: false,
              };
              const messages = this.data.messages.concat([pendingMessage]);
              this.setData({
                messages,
                scrollIntoView: 'message-' + tempId,
              });
              this.sendMessageWithRetry(pendingMessage);
            } catch (error) {
              wx.showToast({ title: (error && error.message) || '上传图片失败', icon: 'none' });
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
    const src = event.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },
});
