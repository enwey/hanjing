"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js"),
  api = require("../../api/index.js");
Math || (n + o)();
const n = () => "../../components/base/hj-navbar.js",
  o = () => "../../components/base/hj-button.js",
  a = e.defineComponent({
    __name: "success",
    setup(n) {
      const o = t.useAppointmentStore(),
        a = t.useStoreStore(),
        i = t.useDoctorStore(),
        r = e.ref(null),
        s = e.ref(!0),
        cancelLimitText = e.ref("就诊前2小时");
      function l() {
        e.index.switchTab({ url: "/pages/index/index" });
      }
      function c() {
        var t, n;
        (null == (n = null == (t = r.value) ? void 0 : t.appointment)
          ? void 0
          : n.id) &&
          e.index.redirectTo({
            url: `/pages/appointment/detail?id=${r.value.appointment.id}`,
          });
      }
      function u() {
        var e, t;
        return (null == (t = null == (e = r.value) ? void 0 : e.appointment) ? void 0 : t.storeName) || "";
      }
      function d() {
        var e, t;
        return (
          (null == (t = null == (e = r.value) ? void 0 : e.appointment) ? void 0 : t.doctorName) || ""
        );
      }
      return (
        e.onMounted(async () => {
          (await a.fetchStores(),
            await i.fetchDoctors(),
            (async function () {
              try {
                const settingsRes = await api.getBookingSettings();
                if (settingsRes && settingsRes.data) {
                  cancelLimitText.value = settingsRes.data.cancelLimit || "就诊前2小时";
                }
              } catch (settingsErr) {
                console.error("加载预约设置失败", settingsErr);
              }
              const pages = getCurrentPages();
              const curPage = pages[pages.length - 1] || {};
              const options = curPage.options || (curPage.$page && curPage.$page.options) || {};
              const n = options.id;
              if (n) {
                try {
                  const t = await api.getAppointmentDetail(n);
                  r.value = t.data;
                } catch (o) {
                  console.error("加载失败", o);
                }
              }
              s.value = !1;
            })());
        }),
        (t, n) => {
          var a, i, s;
          return {
            a: e.p({ title: "预约成功", "show-back": !0 }),
            b: e.t((null == (i = null == (a = r.value) ? void 0 : a.appointment) ? void 0 : i.appointmentNo) || ""),
            c: e.t(u()),
            d: e.t(d()),
            e: e.t((null == (s = null == r.value ? void 0 : r.value.appointment) ? void 0 : s.appointmentDate) || ""),
            f: e.t(
              (null == (s = null == r.value ? void 0 : r.value.appointment) ? void 0 : s.appointmentTime) || "",
            ),
            g: e.t(cancelLimitText.value),
            h: e.o(c, "32"),
            i: e.p({ type: "primary", size: "lg", block: !0 }),
            j: e.o(l, "07"),
            k: e.p({ type: "ghost", size: "lg", block: !0 }),
          };
        }
      );
    },
  }),
  i = e._export_sfc(a, [["__scopeId", "data-v-baa6e4ef"]]);
wx.createPage(i);
