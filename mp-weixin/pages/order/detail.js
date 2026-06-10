"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../api/index.js");
Math || a();
const a = () => "../../components/base/hj-navbar.js",
  l = e.defineComponent({
    __name: "detail",
    setup(a) {
      const l = e.ref(null),
        n = e.ref(!0),
        d = {
          pending: {
            current: 0,
            steps: [
              { label: "待付款", done: !0 },
              { label: "已支付", done: !1 },
              { label: "已发货", done: !1 },
              { label: "已完成", done: !1 },
            ],
          },
          paid: {
            current: 1,
            steps: [
              { label: "待付款", done: !0 },
              { label: "已支付", done: !0 },
              { label: "已发货", done: !1 },
              { label: "已完成", done: !1 },
            ],
          },
          shipped: {
            current: 2,
            steps: [
              { label: "待付款", done: !0 },
              { label: "已支付", done: !0 },
              { label: "已发货", done: !0 },
              { label: "已完成", done: !1 },
            ],
          },
          completed: {
            current: 3,
            steps: [
              { label: "待付款", done: !0 },
              { label: "已支付", done: !0 },
              { label: "已发货", done: !0 },
              { label: "已完成", done: !0 },
            ],
          },
          cancelled: { current: 0, steps: [{ label: "已取消", done: !0 }] },
        },
        o = {
          pending: "待付款",
          paid: "已支付",
          shipped: "已发货",
          completed: "已完成",
          cancelled: "已取消",
          confirmed: "已确认",
        };
      function u(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      return (
        e.onLoad(async (a) => {
          const d = null == a ? void 0 : a.id;
          if (!d) return void e.index.navigateBack();
          const o = await t.getOrderDetail(d);
          ((l.value = o.data || o), (n.value = !1));
        }),
        (t, a) => {
          var s, p;
          return e.e(
            { a: e.p({ title: "订单详情" }), b: n.value },
            n.value
              ? {}
              : l.value
                ? e.e(
                    {
                      d: e.t(o[l.value.status] || l.value.status),
                      e: e.f(
                        (d[l.value.status] || d.pending).steps,
                        (t, a, n) =>
                          e.e(
                            {
                              a: t.done ? 1 : "",
                              b:
                                a <
                                (d[l.value.status] || d.pending).steps.length -
                                  1,
                            },
                            a <
                              (d[l.value.status] || d.pending).steps.length - 1
                              ? {
                                  c: (d[l.value.status] || d.pending).steps[
                                    a + 1
                                  ].done
                                    ? 1
                                    : "",
                                }
                              : {},
                            { d: a },
                          ),
                      ),
                      f: e.f(l.value.items, (t, a, l) =>
                        e.e(
                          { a: t.productImage },
                          t.productImage ? { b: t.productImage } : {},
                          {
                            c: e.t(t.productName),
                            d: e.t(t.quantity),
                            e: e.t(u(t.price)),
                            f: t.productId,
                          },
                        ),
                      ),
                      g: e.t(u(l.value.totalAmount)),
                      h: l.value.discountAmount > 0,
                    },
                    l.value.discountAmount > 0
                      ? { i: e.t(u(l.value.discountAmount)) }
                      : {},
                    {
                      j: e.t(u(l.value.payAmount)),
                      k: e.t(l.value.orderNo),
                      l: e.t(
                        null == (s = l.value.createdAt)
                          ? void 0
                          : s.slice(0, 16).replace("T", " "),
                      ),
                      m: l.value.payAt,
                    },
                    l.value.payAt
                      ? {
                          n: e.t(
                            null == (p = l.value.payAt)
                              ? void 0
                              : p.slice(0, 16).replace("T", " "),
                          ),
                        }
                      : {},
                    { o: l.value.payMethod },
                    (l.value.payMethod, {}),
                  )
                : {},
            { c: l.value },
          );
        }
      );
    },
  }),
  n = e._export_sfc(l, [["__scopeId", "data-v-e129e068"]]);
wx.createPage(n);
