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
        s = e.ref(!0);
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
        var e;
        return (null == (e = o.selectedStore) ? void 0 : e.name) || "加载中...";
      }
      function d() {
        var e;
        return (
          (null == (e = o.selectedDoctor) ? void 0 : e.name) || "加载中..."
        );
      }
      return (
        e.onMounted(async () => {
          (await a.fetchStores(),
            await i.fetchDoctors(),
            (async function () {
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
            b: e.t(
              (null == (i = null == (a = r.value) ? void 0 : a.appointment)
                ? void 0
                : i.appointmentNo) || "AP20260604XXX",
            ),
            c: e.t(u()),
            d: e.t(d()),
            e: e.t(e.unref(o).selectedDate),
            f: e.t(
              null == (s = e.unref(o).selectedTimeSlot) ? void 0 : s.label,
            ),
            g: e.o(c, "32"),
            h: e.p({ type: "primary", size: "lg", block: !0 }),
            i: e.o(l, "07"),
            j: e.p({ type: "ghost", size: "lg", block: !0 }),
          };
        }
      );
    },
  }),
  i = e._export_sfc(a, [["__scopeId", "data-v-baa6e4ef"]]);
wx.createPage(i);
