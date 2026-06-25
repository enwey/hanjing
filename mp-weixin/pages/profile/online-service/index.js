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
              id: String(Math.random()),
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

      function n() {
        const text = a.value.trim();
        if (!text) return;
        
        i.value.push({
          id: String(Date.now()),
          from: "user",
          text,
          time: new Date().toTimeString().slice(0, 5)
        });
        a.value = "";
        
        request({
          url: "/im/send",
          method: "POST",
          data: { text }
        }).then(res => {
          if (res && res.code === 0) {
            setTimeout(fetchHistory, 1600);
          }
        }).catch(err => {
          console.error("send error:", err);
        });
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
          })),
          c:
            "msg-" +
            (null == (o = i.value[i.value.length - 1]) ? void 0 : o.id),
          d: e.o(n, "ef"),
          e: a.value,
          f: e.o((e) => (a.value = e.detail.value), "ad"),
          g: e.o(n, "08"),
        };
      };
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-72504f8b"]]);
wx.createPage(a);
