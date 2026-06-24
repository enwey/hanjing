"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || l();
const l = () => "../../../components/base/hj-navbar.js",
  u = e.defineComponent({
    __name: "index",
    setup(l) {
      const u = e.ref(!1),
        v = e.ref(!1),
        n = e.ref(!1),
        t = e.ref(0),
        o = e.ref(!1);
      let r = null;
      const recorderManager = wx.getRecorderManager();
      const tempFilePath = e.ref("");

      recorderManager.onStop((res) => {
        console.log("[RecorderManager] Stopped, tempFilePath:", res.tempFilePath);
        tempFilePath.value = res.tempFilePath;
      });
      recorderManager.onError((err) => {
        console.error("[RecorderManager] Error:", err);
      });

      const s = e.computed(() => {
          const e = Math.floor(t.value / 60),
            a = t.value % 60;
          return `${String(e).padStart(2, "0")}:${String(a).padStart(2, "0")}`;
        }),
        i = e.computed(() => {
          const e = [];
          for (let a = 0; a < 16; a++)
            u.value ? e.push(10 + Math.floor(40 * Math.random())) : e.push(6);
          return e;
        });

      function c() {
        wx.authorize({
          scope: "scope.record",
          success: () => {
            u.value = !0;
            v.value = !1;
            t.value = 0;
            r = setInterval(() => {
              t.value++;
            }, 1000);
            recorderManager.start({
              duration: 600000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: "m4a",
            });
          },
          fail: () => {
            e.index.showModal({
              title: "授权提示",
              content: "我们需使用麦克风来分析您的鼾声，请在系统设置中开启麦克风录音权限。",
              confirmText: "去设置",
              success: (res) => {
                if (res.confirm) {
                  wx.openSetting();
                }
              }
            });
          }
        });
      }

      function onMicTap() {
        if (u.value || n.value) {
          if (u.value) {
            r && clearInterval(r);
            u.value = !1;
            v.value = !1;
            n.value = !0;
            recorderManager.stop();
          }
        } else {
          c();
        }
      }

      async function d() {
        o.value = !0;
        try {
          let fileData = "";
          let fileName = "snore.m4a";
          if (tempFilePath.value) {
            try {
              const fs = wx.getFileSystemManager();
              fileData = fs.readFileSync(tempFilePath.value, "base64");
              const parts = tempFilePath.value.split("/");
              fileName = parts[parts.length - 1];
            } catch (fsErr) {
              console.error("[SnoreRecording] Read file failed:", fsErr);
            }
          }

          const l = (await a.submitSnoreRecording({ 
            duration: t.value,
            fileData: fileData,
            fileName: fileName
          })).data;

          l && l.id
            ? e.index.navigateTo({
                url: "/pages/assessment/snore-result/index?id=" + l.id,
              })
            : e.index.showToast({ title: "分析结果异常", icon: "none" });
        } catch (l) {
          (console.error("[SnoreRecording] 提交失败", l),
            e.index.showToast({
              title: (l && l.message) || "分析失败，请重试",
              icon: "none",
            }));
        } finally {
          o.value = !1;
        }
      }

      return (
        e.onUnmounted(() => {
          r && clearInterval(r);
        }),
        (a, l) =>
          e.e(
            {
              a: e.p({ title: "AI鼾声分析", showBack: !0 }),
              b: u.value || n.value,
            },
            u.value || n.value
              ? {
                  c: e.f(i.value, (e, a, l) => ({
                    a: a,
                    b: e + "px",
                    c: 0.05 * a + "s",
                  })),
                  d: u.value && !v.value ? 1 : "",
                }
              : {},
            { e: u.value || n.value },
            u.value || n.value ? { f: e.t(s.value) } : {},
            { g: u.value && !v.value ? 1 : "", h: !u.value && !n.value },
            u.value || n.value ? (o.value || n.value, {}) : {},
            {
              i: o.value,
              j: n.value,
              k: u.value && !v.value ? 1 : "",
              l: v.value ? 1 : "",
              m: n.value && !u.value ? 1 : "",
              n: o.value ? 1 : "",
              o: e.o(onMicTap, "e5"),
              p: !u.value && !n.value,
            },
            u.value || n.value
              ? ((u.value && !v.value) ||
                  v.value ||
                  (n.value && !o.value) ||
                  o.value,
                {})
              : {},
            {
              q: u.value && !v.value,
              r: v.value,
              s: n.value && !o.value,
              t: o.value,
              v: n.value && !o.value,
            },
            n.value && !o.value ? { w: e.o(c, "2f"), x: e.o(d, "5b") } : {},
            { y: o.value },
            (o.value, {}),
          )
      );
    },
  }),
  v = e._export_sfc(u, [["__scopeId", "data-v-70350287"]]);
wx.createPage(v);
