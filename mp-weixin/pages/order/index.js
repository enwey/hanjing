"use strict";
const e = require("../../common/vendor.js");
(require("../../mock/index.js"), Math || a());
const a = () => "../../components/base/hj-navbar.js",
  t = e.defineComponent({
    __name: "index",
    setup(a) {
      const t = [
          { key: "all", label: "全部" },
          { key: "pending", label: "待付款" },
          { key: "paid", label: "已支付" },
          { key: "shipped", label: "已发货" },
          { key: "completed", label: "已完成" },
        ],
        d = {
          pending: "待付款",
          paid: "已支付",
          shipped: "已发货",
          completed: "已完成",
          cancelled: "已取消",
          confirmed: "已确认",
        },
        l = {
          pending: "#F59E0B",
          paid: "#3B6BF5",
          shipped: "#8B5CF6",
          completed: "#1A9D5C",
          cancelled: "#9CA3AF",
          confirmed: "#3B6BF5",
        },
        n = e.ref("all"),
        r = e.ref([]),
        u = e.ref(!0),
        o = computed(() =>
          "all" === n.value
            ? r.value
            : r.value.filter((e) => e.status === n.value),
        );
      function i(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      return (a, r) =>
        e.e(
          {
            a: e.p({ title: "我的订单" }),
            b: e.f(t, (a, t, d) =>
              e.e(
                { a: e.t(a.label), b: n.value === a.key },
                (n.value, a.key, {}),
                {
                  c: a.key,
                  d: n.value === a.key ? 1 : "",
                  e: e.o((e) => {
                    return ((t = a.key), void (n.value = t));
                    var t;
                  }, a.key),
                },
              ),
            ),
            c: u.value,
          },
          u.value
            ? {}
            : e.e(
                {
                  d: e.f(e.unref(o), (a, t, n) => ({
                    a: e.t(a.orderNo),
                    b: e.t(d[a.status] || a.status),
                    c: l[a.status],
                    d: e.f(a.items, (a, t, d) =>
                      e.e(
                        { a: a.productImage },
                        a.productImage ? { b: a.productImage } : {},
                        {
                          c: e.t(a.productName),
                          d: e.t(a.quantity),
                          e: e.t(i(a.price)),
                          f: a.productId,
                        },
                      ),
                    ),
                    e: e.t(a.items.length),
                    f: e.t(i(a.payAmount)),
                    g: a.id,
                    h: e.o((t) => {
                      return (
                        (d = a.id),
                        void e.index.navigateTo({
                          url: `/pages/order/detail?id=${d}`,
                        })
                      );
                      var d;
                    }, a.id),
                  })),
                  e: !u.value && 0 === e.unref(o).length,
                },
                (u.value || e.unref(o).length, {}),
              ),
        );
    },
  }),
  d = e._export_sfc(t, [["__scopeId", "data-v-a92287bc"]]);
wx.createPage(d);
