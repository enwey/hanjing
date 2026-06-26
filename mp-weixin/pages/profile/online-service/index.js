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
        startPolling();
      });

      e.onUnmounted(() => {
        stopPolling();
      });

      function sendMsgWithRetry(msgObj) {
        msgObj.status = "sending";
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

      return (t, s) => {
        var o;
        return {
          a: e.p({ title: "在线客服", "show-back": !0 }),
          b: e.f(i.value, (t, i, a) => ({
            a: e.t(t.text),
            b: e.t(t.time),
            c: e.n(t.from),
            d: t.id,
            e: "msg-" + t.id,
            f: e.n(t.from),
            sending: t.status === "sending" ? 1 : "",
            failed: t.status === "fail" ? 1 : "",
          })),
          c:
            "msg-" +
            (null == (o = i.value[i.value.length - 1]) ? void 0 : o.id),
          d: e.o(n, "ef"),
          e: a.value,
          f: e.o((e) => (a.value = e.detail.value), "ad"),
          g: e.o(n, "08"),
          retrySendMessage: e.o(retrySendMessage),
        };
      };
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-72504f8b"]]);
wx.createPage(a);
