"use strict";
const e = require("../../../common/vendor.js");
const request = require("../../../api/request.js").request;

Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  i = e.defineComponent({
    __name: "index",
    setup(t) {
      const i = e.ref([]),
        a = e.ref("");

      let pollTimer = null;

      function fetchHistory() {
        request({ url: "/im/messages" }).then(res => {
          if (res && res.code === 0 && res.data) {
            i.value = res.data.map(m => ({
              id: String(m.id),
              from: m.sender === "doctor" ? "assistant" : "user",
              text: m.text,
              time: m.time
            }));
          }
        }).catch(err => {
          console.error("fetchHistory error:", err);
        });
      }

      let socketTask = null;
      let isSocketConnected = false;

      function connectSocket() {
        const token = e.index.getStorageSync("access_token");
        if (!token) return;

        const BASE_URL = require("../../../api/request.js").BASE_URL;
        const wsUrl = BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/im/ws?token=" + encodeURIComponent(token);

        console.log("[WebSocket] Connecting to", wsUrl);
        socketTask = e.index.connectSocket({
          url: wsUrl,
          complete: () => {}
        });

        socketTask.onOpen(() => {
          console.log("[WebSocket] Connected successfully!");
          isSocketConnected = true;
          stopPolling();
        });

        socketTask.onMessage((res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.type === 'pong') return;

            if (data.type === 'ack') {
              const found = i.value.find(item => item.text === data.text && item.status === 'sending');
              if (found) {
                found.id = data.id;
                found.status = 'success';
                found.time = data.time;
              }
            } else if (data.type === 'message') {
              const isDuplicated = i.value.some(item => item.id === data.id);
              if (!isDuplicated) {
                i.value.push({
                  id: data.id,
                  from: data.from,
                  text: data.text,
                  time: data.time,
                  status: 'success'
                });
              }
            }
          } catch (err) {
            console.error("[WebSocket] message error:", err);
          }
        });

        socketTask.onClose(() => {
          console.log("[WebSocket] Closed.");
          isSocketConnected = false;
          startPolling();
        });

        socketTask.onError((err) => {
          console.error("[WebSocket] Error:", err);
          isSocketConnected = false;
          startPolling();
        });
      }

      function disconnectSocket() {
        if (socketTask) {
          socketTask.close();
          socketTask = null;
        }
        isSocketConnected = false;
      }

      function startPolling() {
        stopPolling();
        pollTimer = setInterval(fetchHistory, 4000);
      }

      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      e.onMounted(() => {
        fetchHistory();
        connectSocket();
      });

      e.onUnmounted(() => {
        disconnectSocket();
        stopPolling();
      });

      function sendMsgWithRetry(msgObj) {
        msgObj.status = "sending";
        if (isSocketConnected && socketTask) {
          socketTask.send({
            data: JSON.stringify({ text: msgObj.text }),
            fail: () => {
              sendViaHttp(msgObj);
            }
          });
        } else {
          sendViaHttp(msgObj);
        }
      }

      function sendViaHttp(msgObj) {
        request({
          url: "/im/send",
          method: "POST",
          data: { text: msgObj.text }
        }).then(res => {
          if (res && res.code === 0) {
            msgObj.status = "success";
            setTimeout(fetchHistory, 1600);
          } else {
            msgObj.status = "fail";
          }
        }).catch(err => {
          console.error("send error:", err);
          msgObj.status = "fail";
        });
      }

      function n() {
        const text = a.value.trim();
        if (!text) return;

        const newMsgObj = {
          id: String(Date.now()),
          from: "user",
          text,
          time: new Date().toTimeString().slice(0, 5),
          status: "sending"
        };
        i.value.push(newMsgObj);
        a.value = "";

        sendMsgWithRetry(newMsgObj);
      }

      function retrySendMessage(eDetail) {
        const msgId = eDetail.currentTarget.dataset.id;
        const found = i.value.find(item => item.id === msgId);
        if (found) {
          sendMsgWithRetry(found);
        }
      }

      function onUploadImage() {
        e.index.chooseMedia({
          count: 1,
          mediaType: ["image"],
          success: (res) => {
            const tempFilePath = res.tempFiles[0].tempFilePath;
            const ext = tempFilePath.split('.').pop() || 'jpg';
            e.index.showLoading({ title: "上传中..." });
            const fs = e.index.getFileSystemManager();
            fs.readFile({
              filePath: tempFilePath,
              success: async (readRes) => {
                try {
                  const uploadRes = await require("../../../api/index.js").uploadFile(readRes.data, ext);
                  if (uploadRes && uploadRes.code === 0 && uploadRes.data && uploadRes.data.url) {
                    const imageUrl = uploadRes.data.url;
                    const text = `[image]${imageUrl}`;
                    const newMsgObj = {
                      id: String(Date.now()),
                      from: "user",
                      text,
                      time: new Date().toTimeString().slice(0, 5),
                      status: "sending"
                    };
                    i.value.push(newMsgObj);
                    sendMsgWithRetry(newMsgObj);
                  } else {
                    e.index.showToast({ title: "上传图片失败", icon: "none" });
                  }
                } catch (err) {
                  console.error(err);
                  e.index.showToast({ title: "上传图片失败，请重试", icon: "none" });
                } finally {
                  e.index.hideLoading();
                }
              },
              fail: () => {
                e.index.hideLoading();
                e.index.showToast({ title: "读取文件失败", icon: "none" });
              }
            });
          }
        });
      }

      function onPreviewImage(evt) {
        const src = evt.currentTarget.dataset.src;
        if (src) {
          const BASE_URL = require("../../../api/request.js").BASE_URL;
          const fullUrl = src.startsWith('http') ? src : `${BASE_URL}${src}`;
          e.index.previewImage({
            urls: [fullUrl],
            current: fullUrl
          });
        }
      }

      return (t, s) => {
        var o;
        return {
          a: e.p({ title: "在线客服", "show-back": !0 }),
          b: e.f(i.value, (t, i, a) => {
            const isImg = t.text.startsWith("[image]") || t.text.startsWith("/uploads/") || t.text.startsWith("http");
            let displayUrl = t.text.startsWith("[image]") ? t.text.slice(7) : t.text;
            if (displayUrl && !displayUrl.startsWith('http') && displayUrl.startsWith('/uploads')) {
              const BASE_URL = require("../../../api/request.js").BASE_URL;
              displayUrl = `${BASE_URL}${displayUrl}`;
            }
            return {
              a: e.t(t.text),
              b: e.t(t.time),
              c: e.n(t.from),
              d: t.id,
              e: "msg-" + t.id,
              f: e.n(t.from),
              sending: t.status === "sending" ? 1 : "",
              failed: t.status === "fail" ? 1 : "",
              isImg,
              displayUrl,
            };
          }),
          c:
            "msg-" +
            (null == (o = i.value[i.value.length - 1]) ? void 0 : o.id),
          d: e.o(n, "ef"),
          e: a.value,
          f: e.o((e) => (a.value = e.detail.value), "ad"),
          g: e.o(n, "08"),
          retrySendMessage: e.o(retrySendMessage),
          onUploadImage: e.o(onUploadImage),
          onPreviewImage: e.o(onPreviewImage),
        };
      };
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-72504f8b"]]);
wx.createPage(a);
