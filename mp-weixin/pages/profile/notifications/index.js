"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(a) {
      const n = e.ref([]),
        i = e.ref(0),
        o = e.ref(!0);
      async function fetchNotifications() {
        o.value = !0;
        const e = (await t.getNotifications()).data;
        ((n.value = (null == e ? void 0 : e.list) || e || []),
          (i.value =
            (null == e ? void 0 : e.unread) ||
            n.value.filter((e) => !e.isRead).length),
          (o.value = !1));
      }
      async function markAllRead() {
        (await t.markAllNotificationsRead(), await fetchNotifications());
      }
      e.onMounted(async () => {
        await fetchNotifications();
      });
      const l = {
          appointment: "A",
          treatment: "T",
          order: "O",
          system: "S",
          promo: "P",
        },
        c = {
          appointment: "#3B6BF5",
          treatment: "#1A9D5C",
          order: "#F59E0B",
          system: "#6B7280",
          promo: "#EF4444",
        };
      return (a, u) =>
        e.e(
          {
            a: e.p({ title: "消息通知", "show-back": !0 }),
            b: e.t(i.value),
            c: i.value > 0,
          },
          i.value > 0 ? { d: e.o(markAllRead, "31") } : {},
          { e: o.value },
          o.value
            ? {}
            : e.e(
                {
                  f: e.f(n.value, (a, n, i) => {
                    var o;
                    return {
                      a: a.isRead ? "" : 1,
                      b: e.t(l[a.type] || "?"),
                      c: c[a.type] + "15",
                      d: c[a.type],
                      e: e.t(a.title),
                      f: e.t(a.content),
                      g: e.t(
                        null == (o = a.createdAt)
                          ? void 0
                          : o.slice(0, 16).replace("T", " "),
                      ),
                      h: a.id,
                      i: a.isRead ? "" : 1,
                      j: e.o(
                        (e) =>
                          (async function (e) {
                            (await t.markNotificationRead(e), await fetchNotifications());
                          })(a.id),
                        a.id,
                      ),
                    };
                  }),
                  g: 0 === n.value.length,
                },
                (n.value.length, {}),
              ),
        );
    },
  }),
  i = e._export_sfc(n, [["__scopeId", "data-v-c3158b61"]]);
wx.createPage(i);
