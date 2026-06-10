"use strict";
/**
 * @vue/shared v3.5.35
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/
function e(e) {
  const t = Object.create(null);
  for (const n of e.split(",")) t[n] = 1;
  return (e) => e in t;
}
const t = {},
  n = [],
  o = () => {},
  r = () => !1,
  s = (e) =>
    111 === e.charCodeAt(0) &&
    110 === e.charCodeAt(1) &&
    (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97),
  i = (e) => e.startsWith("onUpdate:"),
  c = Object.assign,
  u = (e, t) => {
    const n = e.indexOf(t);
    n > -1 && e.splice(n, 1);
  },
  a = Object.prototype.hasOwnProperty,
  l = (e, t) => a.call(e, t),
  f = Array.isArray,
  p = (e) => "[object Map]" === x(e),
  d = (e) => "[object Set]" === x(e),
  h = (e) => "function" == typeof e,
  g = (e) => "string" == typeof e,
  m = (e) => "symbol" == typeof e,
  v = (e) => null !== e && "object" == typeof e,
  _ = (e) => (v(e) || h(e)) && h(e.then) && h(e.catch),
  y = Object.prototype.toString,
  x = (e) => y.call(e),
  b = (e) => "[object Object]" === x(e),
  w = (e) => g(e) && "NaN" !== e && "-" !== e[0] && "" + parseInt(e, 10) === e,
  $ = e(
    ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted",
  ),
  S = (e) => {
    const t = Object.create(null);
    return (n) => t[n] || (t[n] = e(n));
  },
  k = /-\w/g,
  O = S((e) => e.replace(k, (e) => e.slice(1).toUpperCase())),
  P = /\B([A-Z])/g,
  E = S((e) => e.replace(P, "-$1").toLowerCase()),
  C = S((e) => e.charAt(0).toUpperCase() + e.slice(1)),
  A = S((e) => (e ? `on${C(e)}` : "")),
  I = (e, t) => !Object.is(e, t),
  j = (e, ...t) => {
    for (let n = 0; n < e.length; n++) e[n](...t);
  },
  L = (e) => {
    const t = parseFloat(e);
    return isNaN(t) ? e : t;
  };
function R(e) {
  let t = "";
  if (g(e)) t = e;
  else if (f(e))
    for (let n = 0; n < e.length; n++) {
      const o = R(e[n]);
      o && (t += o + " ");
    }
  else if (v(e)) for (const n in e) e[n] && (t += n + " ");
  return t.trim();
}
const M = (e) => !(!e || !0 !== e.__v_isRef),
  V = (e) =>
    g(e)
      ? e
      : null == e
        ? ""
        : f(e) || (v(e) && (e.toString === y || !h(e.toString)))
          ? M(e)
            ? V(e.value)
            : JSON.stringify(e, T, 2)
          : String(e),
  T = (e, t) =>
    M(t)
      ? T(e, t.value)
      : p(t)
        ? {
            [`Map(${t.size})`]: [...t.entries()].reduce(
              (e, [t, n], o) => ((e[D(t, o) + " =>"] = n), e),
              {},
            ),
          }
        : d(t)
          ? { [`Set(${t.size})`]: [...t.values()].map((e) => D(e)) }
          : m(t)
            ? D(t)
            : !v(t) || f(t) || b(t)
              ? t
              : String(t),
  D = (e, t = "") => {
    var n;
    return m(e) ? `Symbol(${null != (n = e.description) ? n : t})` : e;
  },
  N = "onShow",
  H = "onHide",
  U = "onLaunch",
  B = "onError",
  W = "onThemeChange",
  z = "onPageNotFound",
  F = "onUnhandledRejection",
  X = "onLoad",
  K = "onReady",
  q = "onUnload",
  G = "onInit",
  J = "onSaveExitState",
  Z = "onUploadDouyinVideo",
  Q = "onLiveMount",
  Y = "onTitleClick",
  ee = "onResize",
  te = "onBackPress",
  ne = "onPageScroll",
  oe = "onTabItemTap",
  re = "onReachBottom",
  se = "onPullDownRefresh",
  ie = "onShareTimeline",
  ce = "onShareChat",
  ue = "onCopyUrl",
  ae = "onAddToFavorites",
  le = "onShareAppMessage",
  fe = "onNavigationBarButtonTap",
  pe = "onNavigationBarSearchInputClicked",
  de = "onNavigationBarSearchInputChanged",
  he = "onNavigationBarSearchInputConfirmed",
  ge = "onNavigationBarSearchInputFocusChanged",
  me = "virtualHostId",
  ve = /:/g;
function _e(e, t = null) {
  let n;
  return (...o) => (e && ((n = e.apply(t, o)), (e = null)), n);
}
function ye(e, t) {
  if (!g(t)) return;
  const n = (t = t.replace(/\[(\d+)\]/g, ".$1")).split(".");
  let o = n[0];
  return (
    e || (e = {}),
    1 === n.length ? e[o] : ye(e[o], n.slice(1).join("."))
  );
}
const xe = encodeURIComponent;
function be(e, t = xe) {
  const n = e
    ? Object.keys(e)
        .map((n) => {
          let o = e[n];
          return (
            void 0 === typeof o || null === o
              ? (o = "")
              : b(o) && (o = JSON.stringify(o)),
            t(n) + "=" + t(o)
          );
        })
        .filter((e) => e.length > 0)
        .join("&")
    : null;
  return n ? `?${n}` : "";
}
const we = [
  G,
  X,
  N,
  H,
  q,
  ee,
  te,
  ne,
  oe,
  re,
  se,
  ie,
  le,
  ce,
  ue,
  Z,
  Q,
  Y,
  ae,
  J,
  fe,
  pe,
  de,
  he,
  ge,
];
const $e = [
    N,
    H,
    U,
    B,
    W,
    z,
    F,
    "onExit",
    G,
    X,
    K,
    q,
    ee,
    te,
    ne,
    oe,
    re,
    se,
    ie,
    ae,
    le,
    ce,
    ue,
    Z,
    Q,
    Y,
    J,
    fe,
    pe,
    de,
    he,
    ge,
    "onLastPageBackPress",
  ],
  Se = (() => ({
    onPageScroll: 1,
    onShareAppMessage: 2,
    onShareTimeline: 4,
    onShareChat: 8,
    onCopyUrl: 16,
    onUploadDouyinVideo: 32,
    onLiveMount: 64,
    onTitleClick: 128,
  }))();
function ke(e, t, n = !0) {
  return !(n && !h(t)) && ($e.indexOf(e) > -1 || 0 === e.indexOf("on"));
}
let Oe;
const Pe = [];
const Ee = _e((e, t) => t(e)),
  Ce = function () {};
Ce.prototype = {
  _id: 1,
  on: function (e, t, n) {
    var o = this.e || (this.e = {});
    return (
      (o[e] || (o[e] = [])).push({ fn: t, ctx: n, _id: this._id }),
      this._id++
    );
  },
  once: function (e, t, n) {
    var o = this;
    function r() {
      (o.off(e, r), t.apply(n, arguments));
    }
    return ((r._ = t), this.on(e, r, n));
  },
  emit: function (e) {
    for (
      var t = [].slice.call(arguments, 1),
        n = ((this.e || (this.e = {}))[e] || []).slice(),
        o = 0,
        r = n.length;
      o < r;
      o++
    )
      n[o].fn.apply(n[o].ctx, t);
    return this;
  },
  off: function (e, t) {
    var n = this.e || (this.e = {}),
      o = n[e],
      r = [];
    if (o && t) {
      for (var s = o.length - 1; s >= 0; s--)
        if (o[s].fn === t || o[s].fn._ === t || o[s]._id === t) {
          o.splice(s, 1);
          break;
        }
      r = o;
    }
    return (r.length ? (n[e] = r) : delete n[e], this);
  },
};
var Ae = Ce;
const Ie = "zh-Hans",
  je = "zh-Hant",
  Le = "en";
function Re(e, t) {
  if (!e) return;
  if ("chinese" === (e = (e = e.trim().replace(/_/g, "-")).toLowerCase()))
    return Ie;
  if (0 === e.indexOf("zh"))
    return e.indexOf("-hans") > -1
      ? Ie
      : e.indexOf("-hant") > -1
        ? je
        : ((n = e),
          ["-tw", "-hk", "-mo", "-cht"].find((e) => -1 !== n.indexOf(e))
            ? je
            : Ie);
  var n;
  const o = (function (e, t) {
    return t.find((t) => 0 === e.indexOf(t));
  })(e, [Le, "fr", "es"]);
  return o || void 0;
}
function Me(e) {
  return function () {
    try {
      return e.apply(e, arguments);
    } catch (t) {
      console.error(t);
    }
  };
}
let Ve = 1;
const Te = {};
function De(e, t, n) {
  if ("number" == typeof e) {
    const o = Te[e];
    if (o) return (o.keepAlive || delete Te[e], o.callback(t, n));
  }
  return t;
}
const Ne = "success",
  He = "fail",
  Ue = "complete";
function Be(e, t = {}, { beforeAll: n, beforeSuccess: o } = {}) {
  b(t) || (t = {});
  const {
      success: r,
      fail: s,
      complete: i,
    } = (function (e) {
      const t = {};
      for (const n in e) {
        const o = e[n];
        h(o) && ((t[n] = Me(o)), delete e[n]);
      }
      return t;
    })(t),
    c = h(r),
    u = h(s),
    a = h(i),
    l = Ve++;
  return (
    (function (e, t, n, o = !1) {
      Te[e] = { name: t, keepAlive: o, callback: n };
    })(l, e, (l) => {
      (((l = l || {}).errMsg = (function (e, t) {
        return e && -1 !== e.indexOf(":fail")
          ? t + e.substring(e.indexOf(":fail"))
          : t + ":ok";
      })(l.errMsg, e)),
        h(n) && n(l),
        l.errMsg === e + ":ok" ? (h(o) && o(l, t), c && r(l)) : u && s(l),
        a && i(l));
    }),
    l
  );
}
const We = "success",
  ze = "fail",
  Fe = "complete",
  Xe = {},
  Ke = {};
function qe(e, t) {
  return function (n) {
    return e(n, t) || n;
  };
}
function Ge(e, t, n) {
  let o = !1;
  for (let r = 0; r < e.length; r++) {
    const s = e[r];
    if (o) o = Promise.resolve(qe(s, n));
    else {
      const e = s(t, n);
      if ((_(e) && (o = Promise.resolve(e)), !1 === e))
        return { then() {}, catch() {} };
    }
  }
  return o || { then: (e) => e(t), catch() {} };
}
function Je(e, t = {}) {
  return (
    [We, ze, Fe].forEach((n) => {
      const o = e[n];
      if (!f(o)) return;
      const r = t[n];
      t[n] = function (e) {
        Ge(o, e, t).then((e) => (h(r) && r(e)) || e);
      };
    }),
    t
  );
}
function Ze(e, t) {
  const n = [];
  f(Xe.returnValue) && n.push(...Xe.returnValue);
  const o = Ke[e];
  return (
    o && f(o.returnValue) && n.push(...o.returnValue),
    n.forEach((e) => {
      t = e(t) || t;
    }),
    t
  );
}
function Qe(e) {
  const t = Object.create(null);
  Object.keys(Xe).forEach((e) => {
    "returnValue" !== e && (t[e] = Xe[e].slice());
  });
  const n = Ke[e];
  return (
    n &&
      Object.keys(n).forEach((e) => {
        "returnValue" !== e && (t[e] = (t[e] || []).concat(n[e]));
      }),
    t
  );
}
function Ye(e, t, n, o) {
  const r = Qe(e);
  if (r && Object.keys(r).length) {
    if (f(r.invoke)) {
      return Ge(r.invoke, n).then((n) => t(Je(Qe(e), n), ...o));
    }
    return t(Je(r, n), ...o);
  }
  return t(n, ...o);
}
function et(e, t) {
  return (n = {}, ...o) =>
    (function (e) {
      return !(!b(e) || ![Ne, He, Ue].find((t) => h(e[t])));
    })(n)
      ? Ze(e, Ye(e, t, c({}, n), o))
      : Ze(
          e,
          new Promise((r, s) => {
            Ye(e, t, c({}, n, { success: r, fail: s }), o);
          }),
        );
}
function tt(e, t, n, o = {}) {
  const r = t + ":fail";
  let s = "";
  return (
    (s = n ? (0 === n.indexOf(r) ? n : r + " " + n) : r),
    delete o.errCode,
    De(e, c({ errMsg: s }, o))
  );
}
function nt(e, t, n, o) {
  const r = (function (e) {
    e[0];
  })(t);
  if (r) return r;
}
function ot(e, t, n, o) {
  return (n) => {
    const r = Be(e, n, o),
      s = nt(0, [n]);
    return s
      ? tt(r, e, s)
      : t(n, {
          resolve: (t) =>
            (function (e, t, n) {
              return De(e, c(n || {}, { errMsg: t + ":ok" }));
            })(r, e, t),
          reject: (t, n) =>
            tt(
              r,
              e,
              (function (e) {
                return !e || g(e)
                  ? e
                  : e.stack
                    ? (("undefined" != typeof globalThis &&
                        globalThis.harmonyChannel) ||
                        console.error(e.message + "\n" + e.stack),
                      e.message)
                    : e;
              })(t),
              n,
            ),
        });
  };
}
function rt(e, t, n, o) {
  return (function (e, t) {
    return (...e) => {
      const n = nt(0, e);
      if (n) throw new Error(n);
      return t.apply(null, e);
    };
  })(0, t);
}
let st = !1,
  it = 0,
  ct = 0;
const ut = rt(0, (e, t) => {
  if (
    (0 === it &&
      (function () {
        var e, t;
        let n, o, r;
        {
          const s =
              (null === (e = wx.getWindowInfo) || void 0 === e
                ? void 0
                : e.call(wx)) || wx.getSystemInfoSync(),
            i =
              (null === (t = wx.getDeviceInfo) || void 0 === t
                ? void 0
                : t.call(wx)) || wx.getSystemInfoSync();
          ((n = s.windowWidth), (o = s.pixelRatio), (r = i.platform));
        }
        ((it = n), (ct = o), (st = "ios" === r));
      })(),
    0 === (e = Number(e)))
  )
    return 0;
  let n = (e / 750) * (t || it);
  return (
    n < 0 && (n = -n),
    (n = Math.floor(n + 1e-4)),
    0 === n && (n = 1 !== ct && st ? 0.5 : 1),
    e < 0 ? -n : n
  );
});
function at(e, t) {
  Object.keys(t).forEach((n) => {
    h(t[n]) &&
      (e[n] = (function (e, t) {
        const n = t ? (e ? e.concat(t) : f(t) ? t : [t]) : e;
        return n
          ? (function (e) {
              const t = [];
              for (let n = 0; n < e.length; n++)
                -1 === t.indexOf(e[n]) && t.push(e[n]);
              return t;
            })(n)
          : n;
      })(e[n], t[n]));
  });
}
function lt(e, t) {
  e &&
    t &&
    Object.keys(t).forEach((n) => {
      const o = e[n],
        r = t[n];
      f(o) && h(r) && u(o, r);
    });
}
const ft = rt(0, (e, t) => {
    g(e) && b(t) ? at(Ke[e] || (Ke[e] = {}), t) : b(e) && at(Xe, e);
  }),
  pt = rt(0, (e, t) => {
    g(e) ? (b(t) ? lt(Ke[e], t) : delete Ke[e]) : b(e) && lt(Xe, e);
  });
const dt = new (class {
    constructor() {
      this.$emitter = new Ae();
    }
    on(e, t) {
      return this.$emitter.on(e, t);
    }
    once(e, t) {
      return this.$emitter.once(e, t);
    }
    off(e, t) {
      e ? this.$emitter.off(e, t) : (this.$emitter.e = {});
    }
    emit(e, ...t) {
      this.$emitter.emit(e, ...t);
    }
  })(),
  ht = rt(0, (e, t) => (dt.on(e, t), () => dt.off(e, t))),
  gt = rt(0, (e, t) => (dt.once(e, t), () => dt.off(e, t))),
  mt = rt(0, (e, t) => {
    (f(e) || (e = e ? [e] : []),
      e.forEach((e) => {
        dt.off(e, t);
      }));
  }),
  vt = rt(0, (e, ...t) => {
    dt.emit(e, ...t);
  });
let _t, yt, xt;
function bt(e) {
  try {
    return JSON.parse(e);
  } catch (t) {}
  return e;
}
const wt = [];
function $t(e, t) {
  (wt.forEach((n) => {
    n(e, t);
  }),
    (wt.length = 0));
}
const St = et(
  (kt = "getPushClientId"),
  (function (e, t, n, o) {
    return ot(e, t, 0, o);
  })(
    kt,
    (e, { resolve: t, reject: n }) => {
      Promise.resolve().then(() => {
        (void 0 === xt &&
          ((xt = !1), (_t = ""), (yt = "uniPush is not enabled")),
          wt.push((e, o) => {
            e ? t({ cid: e }) : n(o);
          }),
          void 0 !== _t && $t(_t, yt));
      });
    },
    0,
    Ot,
  ),
);
var kt, Ot;
const Pt = [],
  Et =
    /^\$|__f__|getLocale|setLocale|sendNativeEvent|restoreGlobal|requireGlobal|getCurrentSubNVue|getMenuButtonBoundingClientRect|^report|interceptors|Interceptor$|getSubNVueById|requireNativePlugin|upx2px|rpx2px|hideKeyboard|canIUse|^create|Sync$|Manager$|base64ToArrayBuffer|arrayBufferToBase64|getDeviceInfo|getAppBaseInfo|getWindowInfo|getSystemSetting|getAppAuthorizeSetting/,
  Ct = /^create|Manager$/,
  At = ["createBLEConnection"],
  It = ["request", "downloadFile", "uploadFile", "connectSocket"],
  jt = ["createBLEConnection"],
  Lt = /^on|^off/;
function Rt(e) {
  return Ct.test(e) && -1 === At.indexOf(e);
}
function Mt(e) {
  return Et.test(e) && -1 === jt.indexOf(e);
}
function Vt(e) {
  return -1 !== It.indexOf(e);
}
function Tt(e) {
  return !(
    Rt(e) ||
    Mt(e) ||
    (function (e) {
      return Lt.test(e) && "onPush" !== e;
    })(e)
  );
}
function Dt(e, t) {
  return Tt(e) && h(t)
    ? function (n = {}, ...o) {
        return h(n.success) || h(n.fail) || h(n.complete)
          ? Ze(e, Ye(e, t, c({}, n), o))
          : Ze(
              e,
              new Promise((r, s) => {
                Ye(e, t, c({}, n, { success: r, fail: s }), o);
              }),
            );
      }
    : t;
}
Promise.prototype.finally ||
  (Promise.prototype.finally = function (e) {
    const t = this.constructor;
    return this.then(
      (n) => t.resolve(e && e()).then(() => n),
      (n) =>
        t.resolve(e && e()).then(() => {
          throw n;
        }),
    );
  });
const Nt = ["success", "fail", "cancel", "complete"];
const Ht = () => {
    const e = h(getApp) && getApp({ allowDefault: !0 });
    return e && e.$vm
      ? e.$vm.$locale
      : (function () {
          var e;
          let t = "";
          {
            const n =
              (null === (e = wx.getAppBaseInfo) || void 0 === e
                ? void 0
                : e.call(wx)) || wx.getSystemInfoSync();
            t = Re(n && n.language ? n.language : Le) || Le;
          }
          return t;
        })();
  },
  Ut = [];
"undefined" != typeof global && (global.getLocale = Ht);
const Bt = "__DC_STAT_UUID";
let Wt;
function zt(e = wx) {
  return function (t, n) {
    ((Wt = Wt || e.getStorageSync(Bt)),
      Wt ||
        ((Wt = Date.now() + "" + Math.floor(1e7 * Math.random())),
        wx.setStorage({ key: Bt, data: Wt })),
      (n.deviceId = Wt));
  };
}
function Ft(e, t) {
  if (e.safeArea) {
    const n = e.safeArea;
    t.safeAreaInsets = {
      top: n.top,
      left: n.left,
      right: e.windowWidth - n.right,
      bottom: e.screenHeight - n.bottom,
    };
  }
}
function Xt(e, t) {
  let n = "",
    o = "";
  switch (((n = t), (o = e.split(" ")[1] || ""), (n = n.toLowerCase()), n)) {
    case "harmony":
    case "ohos":
    case "openharmonyos":
    case "openharmony":
      n = "harmonyos";
      break;
    case "iphone os":
      n = "ios";
      break;
    case "mac":
    case "darwin":
      n = "macos";
      break;
    case "windows_nt":
      n = "windows";
  }
  return { osName: n, osVersion: o, system: e };
}
function Kt(e) {
  return ("ohos" === (e = e.toLowerCase()) && (e = "harmonyos"), e);
}
function qt(e, t) {
  const n = e.platform || "";
  let o = e.deviceType || "phone";
  {
    const e = { ipad: "pad", windows: "pc", mac: "pc", linux: "pc", pc: "pc" },
      n = Object.keys(e),
      r = t.toLowerCase();
    for (let t = 0; t < n.length; t++) {
      const s = n[t];
      if (-1 !== r.indexOf(s)) {
        o = e[s];
        break;
      }
    }
  }
  return ("ohos_pc" === n && (o = "pc"), o);
}
function Gt(e) {
  let t = e;
  return (t && (t = t.toLowerCase()), t);
}
function Jt(e) {
  return Ht ? Ht() : e;
}
function Zt(e) {
  let t = e.hostName || "WeChat";
  return (
    e.environment
      ? (t = e.environment)
      : e.host && e.host.env && (t = e.host.env),
    t
  );
}
const Qt = {
    returnValue: (e, t) => {
      (Ft(e, t),
        zt()(e, t),
        (function (e, t) {
          const {
              brand: n = "",
              model: o = "",
              system: r = "",
              language: s = "",
              theme: i,
              version: u,
              platform: a,
              fontSizeSetting: l,
              SDKVersion: f,
              pixelRatio: p,
              deviceOrientation: d,
            } = e,
            { osName: h, osVersion: g, system: m } = Xt(r, a);
          let v = u,
            _ = qt(e, o),
            y = Gt(n),
            x = Zt(e),
            b = d,
            w = p,
            $ = f;
          const S = (s || "").replace(/_/g, "-"),
            k = {
              appId: "__UNI__XXXXXXX",
              appName: "鼾静健康诊所",
              appVersion: "1.0.0",
              appVersionCode: "100",
              appLanguage: Jt(S),
              uniCompileVersion: "5.12",
              uniCompilerVersion: "5.12",
              uniRuntimeVersion: "5.12",
              uniPlatform: "mp-weixin",
              deviceBrand: y,
              deviceModel: o,
              deviceType: _,
              devicePixelRatio: w,
              deviceOrientation: b,
              osName: h,
              osVersion: g,
              hostTheme: i,
              hostVersion: v,
              hostLanguage: S,
              hostName: x,
              hostSDKVersion: $,
              hostFontSizeSetting: l,
              windowTop: 0,
              windowBottom: 0,
              platform: Kt(a),
              system: m,
              osLanguage: void 0,
              osTheme: void 0,
              ua: void 0,
              hostPackageName: void 0,
              browserName: void 0,
              browserVersion: void 0,
              isUniAppX: !1,
            };
          c(t, k);
        })(e, t));
    },
  },
  Yt = Qt,
  en = {
    args(e, t) {
      let n = parseInt(e.current);
      if (isNaN(n)) return;
      const o = e.urls;
      if (!f(o)) return;
      const r = o.length;
      return r
        ? (n < 0 ? (n = 0) : n >= r && (n = r - 1),
          n > 0
            ? ((t.current = o[n]),
              (t.urls = o.filter((e, t) => !(t < n) || e !== o[n])))
            : (t.current = o[0]),
          { indicator: !1, loop: !1 })
        : void 0;
    },
  },
  tn = {
    args(e, t) {
      t.alertText = e.title;
    },
  },
  nn = {
    returnValue: (e, t) => {
      const { brand: n, model: o, system: r = "", platform: s = "" } = e;
      let i = qt(e, o),
        u = Gt(n);
      zt()(e, t);
      const { osName: a, osVersion: l } = Xt(r, s);
      t = c(t, {
        deviceType: i,
        deviceBrand: u,
        deviceModel: o,
        osName: a,
        osVersion: l,
        platform: Kt(s),
      });
    },
  },
  on = {
    returnValue: (e, t) => {
      const { version: n, language: o, SDKVersion: r, theme: s } = e;
      let i = Zt(e),
        u = (o || "").replace(/_/g, "-");
      const a = {
        appId: "__UNI__XXXXXXX",
        appName: "鼾静健康诊所",
        appVersion: "1.0.0",
        appVersionCode: "100",
        appLanguage: Jt(u),
        hostVersion: n,
        hostLanguage: u,
        hostName: i,
        hostSDKVersion: r,
        hostTheme: s,
        isUniAppX: !1,
        uniPlatform: "mp-weixin",
        uniCompileVersion: "5.12",
        uniCompilerVersion: "5.12",
        uniRuntimeVersion: "5.12",
      };
      c(t, a);
    },
  },
  rn = {
    returnValue: (e, t) => {
      (Ft(e, t), (t = c(t, { windowTop: 0, windowBottom: 0 })));
    },
  },
  sn = {
    args(e) {
      const t = getApp({ allowDefault: !0 }) || {};
      t.$vm
        ? Fr(B, e, t.$vm.$)
        : (wx.$onErrorHandlers || (wx.$onErrorHandlers = []),
          wx.$onErrorHandlers.push(e));
    },
  },
  cn = {
    args(e) {
      const t = getApp({ allowDefault: !0 }) || {};
      if (t.$vm) {
        if (e.__weh) {
          const n = t.$vm.$[B];
          if (n) {
            const t = n.indexOf(e.__weh);
            t > -1 && n.splice(t, 1);
          }
        }
      } else {
        if (!wx.$onErrorHandlers) return;
        const t = wx.$onErrorHandlers.findIndex((t) => t === e);
        -1 !== t && wx.$onErrorHandlers.splice(t, 1);
      }
    },
  },
  un = {
    args() {
      if (wx.__uni_console__) {
        if (wx.__uni_console_warned__) return;
        ((wx.__uni_console_warned__ = !0),
          console.warn(
            "开发模式下小程序日志回显会使用 socket 连接，为了避免冲突，建议使用 SocketTask 的方式去管理 WebSocket 或手动关闭日志回显功能。[详情](https://uniapp.dcloud.net.cn/tutorial/run/mp-log.html)",
          ));
      }
    },
  },
  an = un,
  ln = {
    $on: ht,
    $off: mt,
    $once: gt,
    $emit: vt,
    upx2px: ut,
    rpx2px: ut,
    interceptors: {},
    addInterceptor: ft,
    removeInterceptor: pt,
    onCreateVueApp: function (e) {
      if (Oe) return e(Oe);
      Pe.push(e);
    },
    invokeCreateVueAppHook: function (e) {
      ((Oe = e), Pe.forEach((t) => t(e)));
    },
    getLocale: Ht,
    setLocale: (e) => {
      const t = h(getApp) && getApp();
      if (!t) return !1;
      return (
        t.$vm.$locale !== e &&
        ((t.$vm.$locale = e), Ut.forEach((t) => t({ locale: e })), !0)
      );
    },
    onLocaleChange: (e) => {
      -1 === Ut.indexOf(e) && Ut.push(e);
    },
    getPushClientId: St,
    onPushMessage: (e) => {
      -1 === Pt.indexOf(e) && Pt.push(e);
    },
    offPushMessage: (e) => {
      if (e) {
        const t = Pt.indexOf(e);
        t > -1 && Pt.splice(t, 1);
      } else Pt.length = 0;
    },
    invokePushCallback: function (e) {
      if ("enabled" === e.type) xt = !0;
      else if ("clientId" === e.type)
        ((_t = e.cid), (yt = e.errMsg), $t(_t, e.errMsg));
      else if ("pushMsg" === e.type) {
        const t = { type: "receive", data: bt(e.message) };
        for (let e = 0; e < Pt.length; e++) {
          if (((0, Pt[e])(t), t.stopped)) break;
        }
      } else
        "click" === e.type &&
          Pt.forEach((t) => {
            t({ type: "click", data: bt(e.message) });
          });
    },
    __f__: function (e, t, ...n) {
      (t && n.push(t), console[e].apply(console, n));
    },
  };
const fn = [
    "qy",
    "env",
    "error",
    "version",
    "lanDebug",
    "cloud",
    "serviceMarket",
    "router",
    "worklet",
    "__webpack_require_UNI_MP_PLUGIN__",
  ],
  pn = ["lanDebug", "router", "worklet"],
  dn = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
function hn(e) {
  return (
    (!dn || 1154 !== dn.scene || !pn.includes(e)) &&
    (fn.indexOf(e) > -1 || "function" == typeof wx[e])
  );
}
function gn() {
  const e = {};
  for (const t in wx) hn(t) && (e[t] = wx[t]);
  return (
    "undefined" != typeof globalThis &&
      "undefined" == typeof requireMiniProgram &&
      (globalThis.wx = e),
    e
  );
}
const mn = ["__route__", "__wxExparserNodeId__", "__wxWebviewId__"],
  vn =
    ((_n = {
      oauth: ["weixin"],
      share: ["weixin"],
      payment: ["wxpay"],
      push: ["weixin"],
    }),
    function ({ service: e, success: t, fail: n, complete: o }) {
      let r;
      (_n[e]
        ? ((r = { errMsg: "getProvider:ok", service: e, provider: _n[e] }),
          h(t) && t(r))
        : ((r = { errMsg: "getProvider:fail:服务[" + e + "]不存在" }),
          h(n) && n(r)),
        h(o) && o(r));
    });
var _n;
const yn = gn();
((yn.getAppBaseInfo && yn.getAppBaseInfo()) ||
  (yn.getAppBaseInfo = yn.getSystemInfoSync),
  (yn.getWindowInfo && yn.getWindowInfo()) ||
    (yn.getWindowInfo = yn.getSystemInfoSync),
  (yn.getDeviceInfo && yn.getDeviceInfo()) ||
    (yn.getDeviceInfo = yn.getSystemInfoSync));
let xn = yn.getAppBaseInfo && yn.getAppBaseInfo();
xn || (xn = yn.getSystemInfoSync());
const bn = xn ? xn.host : null,
  wn =
    bn && "SAAASDK" === bn.env
      ? yn.miniapp.shareVideoMessage
      : yn.shareVideoMessage;
var $n = Object.freeze({
  __proto__: null,
  createSelectorQuery: function () {
    const e = yn.createSelectorQuery(),
      t = e.in;
    return (
      (e.in = function (e) {
        return e.$scope
          ? t.call(this, e.$scope)
          : t.call(
              this,
              (function (e) {
                const t = Object.create(null);
                return (
                  mn.forEach((n) => {
                    t[n] = e[n];
                  }),
                  t
                );
              })(e),
            );
      }),
      e
    );
  },
  getProvider: vn,
  shareVideoMessage: wn,
});
const Sn = {
  args(e, t) {
    (e.compressedHeight &&
      !t.compressHeight &&
      (t.compressHeight = e.compressedHeight),
      e.compressedWidth &&
        !t.compressWidth &&
        (t.compressWidth = e.compressedWidth));
  },
};
var kn = (function (e, t, n = wx) {
  const o = (function (e) {
    function t(e, t, n) {
      return function (r) {
        return t(o(e, r, n));
      };
    }
    function n(e, n, o = {}, r = {}, s = !1) {
      if (b(n)) {
        const i = !0 === s ? n : {};
        h(o) && (o = o(n, i) || {});
        for (const c in n)
          if (l(o, c)) {
            let t = o[c];
            (h(t) && (t = t(n[c], n, i)),
              t
                ? g(t)
                  ? (i[t] = n[c])
                  : b(t) && (i[t.name ? t.name : c] = t.value)
                : console.warn(`微信小程序 ${e} 暂不支持 ${c}`));
          } else if (-1 !== Nt.indexOf(c)) {
            const o = n[c];
            h(o) && (i[c] = t(e, o, r));
          } else s || l(i, c) || (i[c] = n[c]);
        return i;
      }
      return (h(n) && (h(o) && o(n, {}), (n = t(e, n, r))), n);
    }
    function o(t, o, r, s = !1) {
      return (
        h(e.returnValue) && (o = e.returnValue(t, o)),
        n(t, o, r, {}, s || !1)
      );
    }
    return function (t, r) {
      const s = l(e, t);
      if (!s && "function" != typeof wx[t]) return r;
      const i = s || h(e.returnValue) || Rt(t) || Vt(t),
        c = s || h(r);
      if (!s && !r)
        return function () {
          console.error(`微信小程序 暂不支持${t}`);
        };
      if (!i || !c) return r;
      const u = e[t];
      return function (e, r) {
        let s = u || {};
        h(u) && (s = u(e));
        const i = [(e = n(t, e, s.args, s.returnValue))];
        void 0 !== r && i.push(r);
        const c = wx[s.name || t].apply(wx, i);
        return (
          (Rt(t) || Vt(t)) && c && !c.__v_skip && (c.__v_skip = !0),
          Mt(t) ? o(t, c, s.returnValue, Rt(t)) : c
        );
      };
    };
  })(t);
  return new Proxy(
    {},
    {
      get: (t, r) =>
        l(t, r)
          ? t[r]
          : l(e, r)
            ? Dt(r, e[r])
            : l(ln, r)
              ? Dt(r, ln[r])
              : Dt(r, o(r, n[r])),
    },
  );
})(
  $n,
  Object.freeze({
    __proto__: null,
    compressImage: Sn,
    getAppAuthorizeSetting: {
      returnValue: function (e, t) {
        const { locationReducedAccuracy: n } = e;
        ((t.locationAccuracy = "unsupported"),
          !0 === n
            ? (t.locationAccuracy = "reduced")
            : !1 === n && (t.locationAccuracy = "full"));
      },
    },
    getAppBaseInfo: on,
    getDeviceInfo: nn,
    getSystemInfo: Qt,
    getSystemInfoSync: Yt,
    getWindowInfo: rn,
    offError: cn,
    onError: sn,
    onSocketMessage: an,
    onSocketOpen: un,
    previewImage: en,
    redirectTo: {},
    showActionSheet: tn,
  }),
  gn(),
);
let On, Pn;
class En {
  constructor(e = !1) {
    ((this.detached = e),
      (this._active = !0),
      (this.effects = []),
      (this.cleanups = []),
      (this.parent = On),
      !e &&
        On &&
        (this.index = (On.scopes || (On.scopes = [])).push(this) - 1));
  }
  get active() {
    return this._active;
  }
  run(e) {
    if (this._active) {
      const t = On;
      try {
        return ((On = this), e());
      } finally {
        On = t;
      }
    }
  }
  on() {
    On = this;
  }
  off() {
    On = this.parent;
  }
  stop(e) {
    if (this._active) {
      let t, n;
      for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].stop();
      for (t = 0, n = this.cleanups.length; t < n; t++) this.cleanups[t]();
      if (this.scopes)
        for (t = 0, n = this.scopes.length; t < n; t++) this.scopes[t].stop(!0);
      if (!this.detached && this.parent && !e) {
        const e = this.parent.scopes.pop();
        e &&
          e !== this &&
          ((this.parent.scopes[this.index] = e), (e.index = this.index));
      }
      ((this.parent = void 0), (this._active = !1));
    }
  }
}
function Cn(e) {
  return new En(e);
}
function An() {
  return On;
}
class In {
  constructor(e, t, n, o) {
    ((this.fn = e),
      (this.trigger = t),
      (this.scheduler = n),
      (this.active = !0),
      (this.deps = []),
      (this._dirtyLevel = 4),
      (this._trackId = 0),
      (this._runnings = 0),
      (this._shouldSchedule = !1),
      (this._depsLength = 0),
      (function (e, t = On) {
        t && t.active && t.effects.push(e);
      })(this, o));
  }
  get dirty() {
    if (2 === this._dirtyLevel || 3 === this._dirtyLevel) {
      ((this._dirtyLevel = 1), Nn());
      for (let e = 0; e < this._depsLength; e++) {
        const t = this.deps[e];
        if (t.computed && (jn(t.computed), this._dirtyLevel >= 4)) break;
      }
      (1 === this._dirtyLevel && (this._dirtyLevel = 0), Hn());
    }
    return this._dirtyLevel >= 4;
  }
  set dirty(e) {
    this._dirtyLevel = e ? 4 : 0;
  }
  run() {
    if (((this._dirtyLevel = 0), !this.active)) return this.fn();
    let e = Vn,
      t = Pn;
    try {
      return ((Vn = !0), (Pn = this), this._runnings++, Ln(this), this.fn());
    } finally {
      (Rn(this), this._runnings--, (Pn = t), (Vn = e));
    }
  }
  stop() {
    var e;
    this.active &&
      (Ln(this),
      Rn(this),
      null == (e = this.onStop) || e.call(this),
      (this.active = !1));
  }
}
function jn(e) {
  return e.value;
}
function Ln(e) {
  (e._trackId++, (e._depsLength = 0));
}
function Rn(e) {
  if (e.deps.length > e._depsLength) {
    for (let t = e._depsLength; t < e.deps.length; t++) Mn(e.deps[t], e);
    e.deps.length = e._depsLength;
  }
}
function Mn(e, t) {
  const n = e.get(t);
  void 0 !== n &&
    t._trackId !== n &&
    (e.delete(t), 0 === e.size && e.cleanup());
}
let Vn = !0,
  Tn = 0;
const Dn = [];
function Nn() {
  (Dn.push(Vn), (Vn = !1));
}
function Hn() {
  const e = Dn.pop();
  Vn = void 0 === e || e;
}
function Un() {
  Tn++;
}
function Bn() {
  for (Tn--; !Tn && zn.length; ) zn.shift()();
}
function Wn(e, t, n) {
  if (t.get(e) !== e._trackId) {
    t.set(e, e._trackId);
    const n = e.deps[e._depsLength];
    n !== t ? (n && Mn(n, e), (e.deps[e._depsLength++] = t)) : e._depsLength++;
  }
}
const zn = [];
function Fn(e, t, n) {
  Un();
  for (const o of e.keys()) {
    let n;
    (o._dirtyLevel < t &&
      (null != n ? n : (n = e.get(o) === o._trackId)) &&
      (o._shouldSchedule || (o._shouldSchedule = 0 === o._dirtyLevel),
      (o._dirtyLevel = t)),
      o._shouldSchedule &&
        (null != n ? n : (n = e.get(o) === o._trackId)) &&
        (o.trigger(),
        (o._runnings && !o.allowRecurse) ||
          2 === o._dirtyLevel ||
          ((o._shouldSchedule = !1), o.scheduler && zn.push(o.scheduler))));
  }
  Bn();
}
const Xn = (e, t) => {
    const n = new Map();
    return ((n.cleanup = e), (n.computed = t), n);
  },
  Kn = new WeakMap(),
  qn = Symbol(""),
  Gn = Symbol("");
function Jn(e, t, n) {
  if (Vn && Pn) {
    let t = Kn.get(e);
    t || Kn.set(e, (t = new Map()));
    let o = t.get(n);
    (o || t.set(n, (o = Xn(() => t.delete(n)))), Wn(Pn, o));
  }
}
function Zn(e, t, n, o, r, s) {
  const i = Kn.get(e);
  if (!i) return;
  let c = [];
  if ("clear" === t) c = [...i.values()];
  else if ("length" === n && f(e)) {
    const e = Number(o);
    i.forEach((t, n) => {
      ("length" === n || (!m(n) && n >= e)) && c.push(t);
    });
  } else
    switch ((void 0 !== n && c.push(i.get(n)), t)) {
      case "add":
        f(e)
          ? w(n) && c.push(i.get("length"))
          : (c.push(i.get(qn)), p(e) && c.push(i.get(Gn)));
        break;
      case "delete":
        f(e) || (c.push(i.get(qn)), p(e) && c.push(i.get(Gn)));
        break;
      case "set":
        p(e) && c.push(i.get(qn));
    }
  Un();
  for (const u of c) u && Fn(u, 4);
  Bn();
}
const Qn = e("__proto__,__v_isRef,__isVue"),
  Yn = new Set(
    Object.getOwnPropertyNames(Symbol)
      .filter((e) => "arguments" !== e && "caller" !== e)
      .map((e) => Symbol[e])
      .filter(m),
  ),
  eo = to();
function to() {
  const e = {};
  return (
    ["includes", "indexOf", "lastIndexOf"].forEach((t) => {
      e[t] = function (...e) {
        const n = Bo(this);
        for (let t = 0, r = this.length; t < r; t++) Jn(n, 0, t + "");
        const o = n[t](...e);
        return -1 === o || !1 === o ? n[t](...e.map(Bo)) : o;
      };
    }),
    ["push", "pop", "shift", "unshift", "splice"].forEach((t) => {
      e[t] = function (...e) {
        (Nn(), Un());
        const n = Bo(this)[t].apply(this, e);
        return (Bn(), Hn(), n);
      };
    }),
    e
  );
}
function no(e) {
  const t = Bo(this);
  return (Jn(t, 0, e), t.hasOwnProperty(e));
}
class oo {
  constructor(e = !1, t = !1) {
    ((this._isReadonly = e), (this._isShallow = t));
  }
  get(e, t, n) {
    const o = this._isReadonly,
      r = this._isShallow;
    if ("__v_isReactive" === t) return !o;
    if ("__v_isReadonly" === t) return o;
    if ("__v_isShallow" === t) return r;
    if ("__v_raw" === t)
      return n === (o ? (r ? Ro : Lo) : r ? jo : Io).get(e) ||
        Object.getPrototypeOf(e) === Object.getPrototypeOf(n)
        ? e
        : void 0;
    const s = f(e);
    if (!o) {
      if (s && l(eo, t)) return Reflect.get(eo, t, n);
      if ("hasOwnProperty" === t) return no;
    }
    const i = Reflect.get(e, t, n);
    return (m(t) ? Yn.has(t) : Qn(t))
      ? i
      : (o || Jn(e, 0, t),
        r
          ? i
          : Go(i)
            ? s && w(t)
              ? i
              : i.value
            : v(i)
              ? o
                ? To(i)
                : Vo(i)
              : i);
  }
}
class ro extends oo {
  constructor(e = !1) {
    super(!1, e);
  }
  set(e, t, n, o) {
    let r = e[t];
    if (!this._isShallow) {
      const t = Ho(r);
      if (
        (Uo(n) || Ho(n) || ((r = Bo(r)), (n = Bo(n))), !f(e) && Go(r) && !Go(n))
      )
        return !t && ((r.value = n), !0);
    }
    const s = f(e) && w(t) ? Number(t) < e.length : l(e, t),
      i = Reflect.set(e, t, n, o);
    return (
      e === Bo(o) && (s ? I(n, r) && Zn(e, "set", t, n) : Zn(e, "add", t, n)),
      i
    );
  }
  deleteProperty(e, t) {
    const n = l(e, t);
    e[t];
    const o = Reflect.deleteProperty(e, t);
    return (o && n && Zn(e, "delete", t, void 0), o);
  }
  has(e, t) {
    const n = Reflect.has(e, t);
    return ((m(t) && Yn.has(t)) || Jn(e, 0, t), n);
  }
  ownKeys(e) {
    return (Jn(e, 0, f(e) ? "length" : qn), Reflect.ownKeys(e));
  }
}
class so extends oo {
  constructor(e = !1) {
    super(!0, e);
  }
  set(e, t) {
    return !0;
  }
  deleteProperty(e, t) {
    return !0;
  }
}
const io = new ro(),
  co = new so(),
  uo = new ro(!0),
  ao = (e) => e,
  lo = (e) => Reflect.getPrototypeOf(e);
function fo(e, t, n = !1, o = !1) {
  const r = Bo((e = e.__v_raw)),
    s = Bo(t);
  n || (I(t, s) && Jn(r, 0, t), Jn(r, 0, s));
  const { has: i } = lo(r),
    c = o ? ao : n ? Fo : zo;
  return i.call(r, t)
    ? c(e.get(t))
    : i.call(r, s)
      ? c(e.get(s))
      : void (e !== r && e.get(t));
}
function po(e, t = !1) {
  const n = this.__v_raw,
    o = Bo(n),
    r = Bo(e);
  return (
    t || (I(e, r) && Jn(o, 0, e), Jn(o, 0, r)),
    e === r ? n.has(e) : n.has(e) || n.has(r)
  );
}
function ho(e, t = !1) {
  return ((e = e.__v_raw), !t && Jn(Bo(e), 0, qn), Reflect.get(e, "size", e));
}
function go(e) {
  e = Bo(e);
  const t = Bo(this);
  return (lo(t).has.call(t, e) || (t.add(e), Zn(t, "add", e, e)), this);
}
function mo(e, t) {
  t = Bo(t);
  const n = Bo(this),
    { has: o, get: r } = lo(n);
  let s = o.call(n, e);
  s || ((e = Bo(e)), (s = o.call(n, e)));
  const i = r.call(n, e);
  return (
    n.set(e, t),
    s ? I(t, i) && Zn(n, "set", e, t) : Zn(n, "add", e, t),
    this
  );
}
function vo(e) {
  const t = Bo(this),
    { has: n, get: o } = lo(t);
  let r = n.call(t, e);
  (r || ((e = Bo(e)), (r = n.call(t, e))), o && o.call(t, e));
  const s = t.delete(e);
  return (r && Zn(t, "delete", e, void 0), s);
}
function _o() {
  const e = Bo(this),
    t = 0 !== e.size,
    n = e.clear();
  return (t && Zn(e, "clear", void 0, void 0), n);
}
function yo(e, t) {
  return function (n, o) {
    const r = this,
      s = r.__v_raw,
      i = Bo(s),
      c = t ? ao : e ? Fo : zo;
    return (!e && Jn(i, 0, qn), s.forEach((e, t) => n.call(o, c(e), c(t), r)));
  };
}
function xo(e, t, n) {
  return function (...o) {
    const r = this.__v_raw,
      s = Bo(r),
      i = p(s),
      c = "entries" === e || (e === Symbol.iterator && i),
      u = "keys" === e && i,
      a = r[e](...o),
      l = n ? ao : t ? Fo : zo;
    return (
      !t && Jn(s, 0, u ? Gn : qn),
      {
        next() {
          const { value: e, done: t } = a.next();
          return t
            ? { value: e, done: t }
            : { value: c ? [l(e[0]), l(e[1])] : l(e), done: t };
        },
        [Symbol.iterator]() {
          return this;
        },
      }
    );
  };
}
function bo(e) {
  return function (...t) {
    return "delete" !== e && ("clear" === e ? void 0 : this);
  };
}
function wo() {
  const e = {
      get(e) {
        return fo(this, e);
      },
      get size() {
        return ho(this);
      },
      has: po,
      add: go,
      set: mo,
      delete: vo,
      clear: _o,
      forEach: yo(!1, !1),
    },
    t = {
      get(e) {
        return fo(this, e, !1, !0);
      },
      get size() {
        return ho(this);
      },
      has: po,
      add: go,
      set: mo,
      delete: vo,
      clear: _o,
      forEach: yo(!1, !0),
    },
    n = {
      get(e) {
        return fo(this, e, !0);
      },
      get size() {
        return ho(this, !0);
      },
      has(e) {
        return po.call(this, e, !0);
      },
      add: bo("add"),
      set: bo("set"),
      delete: bo("delete"),
      clear: bo("clear"),
      forEach: yo(!0, !1),
    },
    o = {
      get(e) {
        return fo(this, e, !0, !0);
      },
      get size() {
        return ho(this, !0);
      },
      has(e) {
        return po.call(this, e, !0);
      },
      add: bo("add"),
      set: bo("set"),
      delete: bo("delete"),
      clear: bo("clear"),
      forEach: yo(!0, !0),
    };
  return (
    ["keys", "values", "entries", Symbol.iterator].forEach((r) => {
      ((e[r] = xo(r, !1, !1)),
        (n[r] = xo(r, !0, !1)),
        (t[r] = xo(r, !1, !0)),
        (o[r] = xo(r, !0, !0)));
    }),
    [e, n, t, o]
  );
}
const [$o, So, ko, Oo] = wo();
function Po(e, t) {
  const n = t ? (e ? Oo : ko) : e ? So : $o;
  return (t, o, r) =>
    "__v_isReactive" === o
      ? !e
      : "__v_isReadonly" === o
        ? e
        : "__v_raw" === o
          ? t
          : Reflect.get(l(n, o) && o in t ? n : t, o, r);
}
const Eo = { get: Po(!1, !1) },
  Co = { get: Po(!1, !0) },
  Ao = { get: Po(!0, !1) },
  Io = new WeakMap(),
  jo = new WeakMap(),
  Lo = new WeakMap(),
  Ro = new WeakMap();
function Mo(e) {
  return e.__v_skip || !Object.isExtensible(e)
    ? 0
    : (function (e) {
        switch (e) {
          case "Object":
          case "Array":
            return 1;
          case "Map":
          case "Set":
          case "WeakMap":
          case "WeakSet":
            return 2;
          default:
            return 0;
        }
      })(((e) => x(e).slice(8, -1))(e));
}
function Vo(e) {
  return Ho(e) ? e : Do(e, !1, io, Eo, Io);
}
function To(e) {
  return Do(e, !0, co, Ao, Lo);
}
function Do(e, t, n, o, r) {
  if (!v(e)) return e;
  if (e.__v_raw && (!t || !e.__v_isReactive)) return e;
  const s = r.get(e);
  if (s) return s;
  const i = Mo(e);
  if (0 === i) return e;
  const c = new Proxy(e, 2 === i ? o : n);
  return (r.set(e, c), c);
}
function No(e) {
  return Ho(e) ? No(e.__v_raw) : !(!e || !e.__v_isReactive);
}
function Ho(e) {
  return !(!e || !e.__v_isReadonly);
}
function Uo(e) {
  return !(!e || !e.__v_isShallow);
}
function Bo(e) {
  const t = e && e.__v_raw;
  return t ? Bo(t) : e;
}
function Wo(e) {
  return (
    Object.isExtensible(e) &&
      ((e, t, n, o = !1) => {
        Object.defineProperty(e, t, {
          configurable: !0,
          enumerable: !1,
          writable: o,
          value: n,
        });
      })(e, "__v_skip", !0),
    e
  );
}
const zo = (e) => (v(e) ? Vo(e) : e),
  Fo = (e) => (v(e) ? To(e) : e);
class Xo {
  constructor(e, t, n, o) {
    ((this.getter = e),
      (this._setter = t),
      (this.dep = void 0),
      (this.__v_isRef = !0),
      (this.__v_isReadonly = !1),
      (this.effect = new In(
        () => e(this._value),
        () => qo(this, 2 === this.effect._dirtyLevel ? 2 : 3),
      )),
      (this.effect.computed = this),
      (this.effect.active = this._cacheable = !o),
      (this.__v_isReadonly = n));
  }
  get value() {
    const e = Bo(this);
    return (
      (e._cacheable && !e.effect.dirty) ||
        !I(e._value, (e._value = e.effect.run())) ||
        qo(e, 4),
      Ko(e),
      e.effect._dirtyLevel >= 2 && qo(e, 2),
      e._value
    );
  }
  set value(e) {
    this._setter(e);
  }
  get _dirty() {
    return this.effect.dirty;
  }
  set _dirty(e) {
    this.effect.dirty = e;
  }
}
function Ko(e) {
  var t;
  Vn &&
    Pn &&
    ((e = Bo(e)),
    Wn(
      Pn,
      null != (t = e.dep)
        ? t
        : (e.dep = Xn(() => (e.dep = void 0), e instanceof Xo ? e : void 0)),
    ));
}
function qo(e, t = 4, n) {
  const o = (e = Bo(e)).dep;
  o && Fn(o, t);
}
function Go(e) {
  return !(!e || !0 !== e.__v_isRef);
}
function Jo(e) {
  return (function (e, t) {
    if (Go(e)) return e;
    return new Zo(e, t);
  })(e, !1);
}
class Zo {
  constructor(e, t) {
    ((this.__v_isShallow = t),
      (this.dep = void 0),
      (this.__v_isRef = !0),
      (this._rawValue = t ? e : Bo(e)),
      (this._value = t ? e : zo(e)));
  }
  get value() {
    return (Ko(this), this._value);
  }
  set value(e) {
    const t = this.__v_isShallow || Uo(e) || Ho(e);
    ((e = t ? e : Bo(e)),
      I(e, this._rawValue) &&
        ((this._rawValue = e), (this._value = t ? e : zo(e)), qo(this, 4)));
  }
}
function Qo(e) {
  return Go(e) ? e.value : e;
}
const Yo = {
  get: (e, t, n) => Qo(Reflect.get(e, t, n)),
  set: (e, t, n, o) => {
    const r = e[t];
    return Go(r) && !Go(n) ? ((r.value = n), !0) : Reflect.set(e, t, n, o);
  },
};
function er(e) {
  return No(e) ? e : new Proxy(e, Yo);
}
class tr {
  constructor(e, t, n) {
    ((this._object = e),
      (this._key = t),
      (this._defaultValue = n),
      (this.__v_isRef = !0));
  }
  get value() {
    const e = this._object[this._key];
    return void 0 === e ? this._defaultValue : e;
  }
  set value(e) {
    this._object[this._key] = e;
  }
  get dep() {
    return (
      (e = Bo(this._object)),
      (t = this._key),
      null == (n = Kn.get(e)) ? void 0 : n.get(t)
    );
    var e, t, n;
  }
}
function nr(e, t, n) {
  const o = e[t];
  return Go(o) ? o : new tr(e, t, n);
}
function or(e, t, n, o) {
  try {
    return o ? e(...o) : e();
  } catch (r) {
    sr(r, t, n);
  }
}
function rr(e, t, n, o) {
  if (h(e)) {
    const r = or(e, t, n, o);
    return (
      r &&
        _(r) &&
        r.catch((e) => {
          sr(e, t, n);
        }),
      r
    );
  }
  const r = [];
  for (let s = 0; s < e.length; s++) r.push(rr(e[s], t, n, o));
  return r;
}
function sr(e, t, n, o = !0) {
  const r = t ? t.vnode : null;
  if (t) {
    let o = t.parent;
    const r = t.proxy,
      s = `https://vuejs.org/error-reference/#runtime-${n}`;
    for (; o; ) {
      const t = o.ec;
      if (t)
        for (let n = 0; n < t.length; n++) if (!1 === t[n](e, r, s)) return;
      o = o.parent;
    }
    const i = t.appContext.config.errorHandler;
    if (i) return void or(i, null, 10, [e, r, s]);
  }
  ir(e, n, r, o);
}
function ir(e, t, n, o = !0) {
  console.error(e);
}
let cr = !1,
  ur = !1;
const ar = [];
let lr = 0;
const fr = [];
let pr = null,
  dr = 0;
const hr = Promise.resolve();
let gr = null;
function mr(e) {
  const t = gr || hr;
  return e ? t.then(this ? e.bind(this) : e) : t;
}
function vr(e) {
  (ar.length && ar.includes(e, cr && e.allowRecurse ? lr + 1 : lr)) ||
    (null == e.id
      ? ar.push(e)
      : ar.splice(
          (function (e) {
            let t = lr + 1,
              n = ar.length;
            for (; t < n; ) {
              const o = (t + n) >>> 1,
                r = ar[o],
                s = br(r);
              s < e || (s === e && r.pre) ? (t = o + 1) : (n = o);
            }
            return t;
          })(e.id),
          0,
          e,
        ),
    _r());
}
function _r() {
  cr || ur || ((ur = !0), (gr = hr.then($r)));
}
function yr(e) {
  (f(e)
    ? fr.push(...e)
    : (pr && pr.includes(e, e.allowRecurse ? dr + 1 : dr)) || fr.push(e),
    _r());
}
function xr(e, t, n = cr ? lr + 1 : 0) {
  for (; n < ar.length; n++) {
    const e = ar[n];
    e && e.pre && (ar.splice(n, 1), n--, e());
  }
}
const br = (e) => (null == e.id ? 1 / 0 : e.id),
  wr = (e, t) => {
    const n = br(e) - br(t);
    if (0 === n) {
      if (e.pre && !t.pre) return -1;
      if (t.pre && !e.pre) return 1;
    }
    return n;
  };
function $r(e) {
  ((ur = !1), (cr = !0), ar.sort(wr));
  try {
    for (lr = 0; lr < ar.length; lr++) {
      const e = ar[lr];
      e && !1 !== e.active && or(e, null, 14);
    }
  } finally {
    ((lr = 0),
      (ar.length = 0),
      (function () {
        if (fr.length) {
          const e = [...new Set(fr)].sort((e, t) => br(e) - br(t));
          if (((fr.length = 0), pr)) return void pr.push(...e);
          for (pr = e, dr = 0; dr < pr.length; dr++) pr[dr]();
          ((pr = null), (dr = 0));
        }
      })(),
      (cr = !1),
      (gr = null),
      (ar.length || fr.length) && $r());
  }
}
function Sr(e, n, ...o) {
  if (e.isUnmounted) return;
  const r = e.vnode.props || t;
  let s = o;
  const i = n.startsWith("update:"),
    c = i && n.slice(7);
  if (c && c in r) {
    const e = `${"modelValue" === c ? "model" : c}Modifiers`,
      { number: n, trim: i } = r[e] || t;
    (i && (s = o.map((e) => (g(e) ? e.trim() : e))), n && (s = o.map(L)));
  }
  let u,
    a = r[(u = A(n))] || r[(u = A(O(n)))];
  (!a && i && (a = r[(u = A(E(n)))]), a && rr(a, e, 6, s));
  const l = r[u + "Once"];
  if (l) {
    if (e.emitted) {
      if (e.emitted[u]) return;
    } else e.emitted = {};
    ((e.emitted[u] = !0), rr(l, e, 6, s));
  }
}
function kr(e, t, n = !1) {
  const o = t.emitsCache,
    r = o.get(e);
  if (void 0 !== r) return r;
  const s = e.emits;
  let i = {},
    u = !1;
  if (!h(e)) {
    const o = (e) => {
      const n = kr(e, t, !0);
      n && ((u = !0), c(i, n));
    };
    (!n && t.mixins.length && t.mixins.forEach(o),
      e.extends && o(e.extends),
      e.mixins && e.mixins.forEach(o));
  }
  return s || u
    ? (f(s) ? s.forEach((e) => (i[e] = null)) : c(i, s), v(e) && o.set(e, i), i)
    : (v(e) && o.set(e, null), null);
}
function Or(e, t) {
  return (
    !(!e || !s(t)) &&
    ((t = t.slice(2).replace(/Once$/, "")),
    l(e, t[0].toLowerCase() + t.slice(1)) || l(e, E(t)) || l(e, t))
  );
}
let Pr = null;
function Er(e) {
  const t = Pr;
  return ((Pr = e), e && e.type.__scopeId, t);
}
function Cr(e, t) {
  return e && (e[t] || e[O(t)] || e[C(O(t))]);
}
const Ar = {};
function Ir(e, t, n) {
  return jr(e, t, n);
}
function jr(
  e,
  n,
  { immediate: r, deep: s, flush: i, once: c, onTrack: a, onTrigger: l } = t,
) {
  if (n && c) {
    const e = n;
    n = (...t) => {
      (e(...t), k());
    };
  }
  const p = Rs,
    d = (e) => (!0 === s ? e : Mr(e, !1 === s ? 1 : void 0));
  let g,
    m,
    v = !1,
    _ = !1;
  if (
    (Go(e)
      ? ((g = () => e.value), (v = Uo(e)))
      : No(e)
        ? ((g = () => d(e)), (v = !0))
        : f(e)
          ? ((_ = !0),
            (v = e.some((e) => No(e) || Uo(e))),
            (g = () =>
              e.map((e) =>
                Go(e) ? e.value : No(e) ? d(e) : h(e) ? or(e, p, 2) : void 0,
              )))
          : (g = h(e)
              ? n
                ? () => or(e, p, 2)
                : () => (m && m(), rr(e, p, 3, [y]))
              : o),
    n && s)
  ) {
    const e = g;
    g = () => Mr(e());
  }
  let y = (e) => {
      m = $.onStop = () => {
        (or(e, p, 4), (m = $.onStop = void 0));
      };
    },
    x = _ ? new Array(e.length).fill(Ar) : Ar;
  const b = () => {
    if ($.active && $.dirty)
      if (n) {
        const e = $.run();
        (s || v || (_ ? e.some((e, t) => I(e, x[t])) : I(e, x))) &&
          (m && m(),
          rr(n, p, 3, [e, x === Ar ? void 0 : _ && x[0] === Ar ? [] : x, y]),
          (x = e));
      } else $.run();
  };
  let w;
  ((b.allowRecurse = !!n),
    "sync" === i
      ? (w = b)
      : "post" === i
        ? (w = () => Cs(b, p && p.suspense))
        : ((b.pre = !0), p && (b.id = p.uid), (w = () => vr(b))));
  const $ = new In(g, o, w),
    S = An(),
    k = () => {
      ($.stop(), S && u(S.effects, $));
    };
  return (
    n
      ? r
        ? b()
        : (x = $.run())
      : "post" === i
        ? Cs($.run.bind($), p && p.suspense)
        : $.run(),
    k
  );
}
function Lr(e, t, n) {
  const o = this.proxy,
    r = g(e) ? (e.includes(".") ? Rr(o, e) : () => o[e]) : e.bind(o, o);
  let s;
  h(t) ? (s = t) : ((s = t.handler), (n = t));
  const i = Ds(this),
    c = jr(r, s.bind(o), n);
  return (i(), c);
}
function Rr(e, t) {
  const n = t.split(".");
  return () => {
    let t = e;
    for (let e = 0; e < n.length && t; e++) t = t[n[e]];
    return t;
  };
}
function Mr(e, t, n = 0, o) {
  if (!v(e) || e.__v_skip) return e;
  if (t && t > 0) {
    if (n >= t) return e;
    n++;
  }
  if ((o = o || new Set()).has(e)) return e;
  if ((o.add(e), Go(e))) Mr(e.value, t, n, o);
  else if (f(e)) for (let r = 0; r < e.length; r++) Mr(e[r], t, n, o);
  else if (d(e) || p(e))
    e.forEach((e) => {
      Mr(e, t, n, o);
    });
  else if (b(e)) for (const r in e) Mr(e[r], t, n, o);
  return e;
}
function Vr() {
  return {
    app: null,
    config: {
      isNativeTag: r,
      performance: !1,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {},
    },
    mixins: [],
    components: {},
    directives: {},
    provides: Object.create(null),
    optionsCache: new WeakMap(),
    propsCache: new WeakMap(),
    emitsCache: new WeakMap(),
  };
}
let Tr = 0;
let Dr = null;
function Nr(e, t, n = !1) {
  const o = Rs || Pr;
  if (o || Dr) {
    const r = o
      ? null == o.parent
        ? o.vnode.appContext && o.vnode.appContext.provides
        : o.parent.provides
      : Dr._context.provides;
    if (r && e in r) return r[e];
    if (arguments.length > 1) return n && h(t) ? t.call(o && o.proxy) : t;
  }
}
const Hr = (e) => e.type.__isKeepAlive;
function Ur(e, t) {
  Wr(e, "a", t);
}
function Br(e, t) {
  Wr(e, "da", t);
}
function Wr(e, t, n = Rs) {
  const o =
    e.__wdc ||
    (e.__wdc = () => {
      let t = n;
      for (; t; ) {
        if (t.isDeactivated) return;
        t = t.parent;
      }
      return e();
    });
  if ((Fr(t, o, n), n)) {
    let e = n.parent;
    for (; e && e.parent; )
      (Hr(e.parent.vnode) && zr(o, t, n, e), (e = e.parent));
  }
}
function zr(e, t, n, o) {
  const r = Fr(t, e, o, !0);
  Qr(() => {
    u(o[t], r);
  }, n);
}
function Fr(e, t, n = Rs, o = !1) {
  if (n) {
    (function (e) {
      return we.indexOf(e) > -1;
    })(e) && (n = n.root);
    const r = n[e] || (n[e] = []),
      s =
        t.__weh ||
        (t.__weh = (...o) => {
          if (n.isUnmounted) return;
          Nn();
          const r = Ds(n),
            s = rr(t, n, e, o);
          return (r(), Hn(), s);
        });
    return (o ? r.unshift(s) : r.push(s), s);
  }
}
const Xr =
    (e) =>
    (t, n = Rs) =>
      (!Us || "sp" === e) && Fr(e, (...e) => t(...e), n),
  Kr = Xr("bm"),
  qr = Xr("m"),
  Gr = Xr("bu"),
  Jr = Xr("u"),
  Zr = Xr("bum"),
  Qr = Xr("um"),
  Yr = Xr("sp"),
  es = Xr("rtg"),
  ts = Xr("rtc");
function ns(e, t = Rs) {
  Fr("ec", e, t);
}
const os = (e) => (e ? (Hs(e) ? zs(e) || e.proxy : os(e.parent)) : null);
const rs = c(Object.create(null), {
    $: function (e) {
      return e;
    },
    $el: (e) => e.__$el || (e.__$el = {}),
    $data: (e) => e.data,
    $props: (e) => e.props,
    $attrs: (e) => e.attrs,
    $slots: (e) => e.slots,
    $refs: (e) => e.refs,
    $parent: (e) => os(e.parent),
    $root: (e) => os(e.root),
    $emit: (e) => e.emit,
    $options: (e) => ps(e),
    $forceUpdate: (e) =>
      e.f ||
      (e.f = () => {
        ((e.effect.dirty = !0), vr(e.update));
      }),
    $watch: (e) => Lr.bind(e),
  }),
  ss = (e, n) => e !== t && !e.__isScriptSetup && l(e, n),
  is = {
    get({ _: e }, n) {
      const {
        ctx: o,
        setupState: r,
        data: s,
        props: i,
        accessCache: c,
        type: u,
        appContext: a,
      } = e;
      let f;
      if ("$" !== n[0]) {
        const u = c[n];
        if (void 0 !== u)
          switch (u) {
            case 1:
              return r[n];
            case 2:
              return s[n];
            case 4:
              return o[n];
            case 3:
              return i[n];
          }
        else {
          if (ss(r, n)) return ((c[n] = 1), r[n]);
          if (s !== t && l(s, n)) return ((c[n] = 2), s[n]);
          if ((f = e.propsOptions[0]) && l(f, n)) return ((c[n] = 3), i[n]);
          if (o !== t && l(o, n)) return ((c[n] = 4), o[n]);
          us && (c[n] = 0);
        }
      }
      const p = rs[n];
      let d, h;
      return p
        ? ("$attrs" === n && Jn(e, 0, n), p(e))
        : (d = u.__cssModules) && (d = d[n])
          ? d
          : o !== t && l(o, n)
            ? ((c[n] = 4), o[n])
            : e.exposed && l(e.exposed, n)
              ? e.exposed[n]
              : ((h = a.config.globalProperties), l(h, n) ? h[n] : void 0);
    },
    set({ _: e }, n, o) {
      const { data: r, setupState: s, ctx: i } = e;
      return ss(s, n)
        ? ((s[n] = o), !0)
        : r !== t && l(r, n)
          ? ((r[n] = o), !0)
          : !l(e.props, n) &&
            ("$" !== n[0] || !(n.slice(1) in e)) &&
            ((i[n] = o), !0);
    },
    has(
      {
        _: {
          data: e,
          setupState: n,
          accessCache: o,
          ctx: r,
          appContext: s,
          propsOptions: i,
        },
      },
      c,
    ) {
      let u;
      return (
        !!o[c] ||
        (e !== t && l(e, c)) ||
        ss(n, c) ||
        ((u = i[0]) && l(u, c)) ||
        l(r, c) ||
        l(rs, c) ||
        l(s.config.globalProperties, c)
      );
    },
    defineProperty(e, t, n) {
      return (
        null != n.get
          ? (e._.accessCache[t] = 0)
          : l(n, "value") && this.set(e, t, n.value, null),
        Reflect.defineProperty(e, t, n)
      );
    },
  };
function cs(e) {
  return f(e) ? e.reduce((e, t) => ((e[t] = null), e), {}) : e;
}
let us = !0;
function as(e) {
  const t = ps(e),
    n = e.proxy,
    r = e.ctx;
  ((us = !1), t.beforeCreate && ls(t.beforeCreate, e, "bc"));
  const {
    data: s,
    computed: i,
    methods: c,
    watch: u,
    provide: a,
    inject: l,
    created: p,
    beforeMount: d,
    mounted: g,
    beforeUpdate: m,
    updated: _,
    activated: y,
    deactivated: x,
    beforeDestroy: b,
    beforeUnmount: w,
    destroyed: $,
    unmounted: S,
    render: k,
    renderTracked: O,
    renderTriggered: P,
    errorCaptured: E,
    serverPrefetch: C,
    expose: A,
    inheritAttrs: I,
    components: j,
    directives: L,
    filters: R,
  } = t;
  if (
    (l &&
      (function (e, t) {
        f(e) && (e = ms(e));
        for (const n in e) {
          const o = e[n];
          let r;
          ((r = v(o)
            ? "default" in o
              ? Nr(o.from || n, o.default, !0)
              : Nr(o.from || n)
            : Nr(o)),
            Go(r)
              ? Object.defineProperty(t, n, {
                  enumerable: !0,
                  configurable: !0,
                  get: () => r.value,
                  set: (e) => (r.value = e),
                })
              : (t[n] = r));
        }
      })(l, r),
    c)
  )
    for (const o in c) {
      const e = c[o];
      h(e) && (r[o] = e.bind(n));
    }
  if (s) {
    const t = s.call(n, n);
    v(t) && (e.data = Vo(t));
  }
  if (((us = !0), i))
    for (const f in i) {
      const e = i[f],
        t = h(e) ? e.bind(n, n) : h(e.get) ? e.get.bind(n, n) : o,
        s = !h(e) && h(e.set) ? e.set.bind(n) : o,
        c = Fs({ get: t, set: s });
      Object.defineProperty(r, f, {
        enumerable: !0,
        configurable: !0,
        get: () => c.value,
        set: (e) => (c.value = e),
      });
    }
  if (u) for (const o in u) fs(u[o], r, n, o);
  function M(e, t) {
    f(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
  }
  if (
    ((function () {
      if (a) {
        const e = h(a) ? a.call(n) : a;
        Reflect.ownKeys(e).forEach((t) => {
          !(function (e, t) {
            if (Rs) {
              let n = Rs.provides;
              const o = Rs.parent && Rs.parent.provides;
              (o === n && (n = Rs.provides = Object.create(o)),
                (n[e] = t),
                "app" === Rs.type.mpType && Rs.appContext.app.provide(e, t));
            }
          })(t, e[t]);
        });
      }
    })(),
    p && ls(p, e, "c"),
    M(Kr, d),
    M(qr, g),
    M(Gr, m),
    M(Jr, _),
    M(Ur, y),
    M(Br, x),
    M(ns, E),
    M(ts, O),
    M(es, P),
    M(Zr, w),
    M(Qr, S),
    M(Yr, C),
    f(A))
  )
    if (A.length) {
      const t = e.exposed || (e.exposed = {});
      A.forEach((e) => {
        Object.defineProperty(t, e, {
          get: () => n[e],
          set: (t) => (n[e] = t),
        });
      });
    } else e.exposed || (e.exposed = {});
  (k && e.render === o && (e.render = k),
    null != I && (e.inheritAttrs = I),
    j && (e.components = j),
    L && (e.directives = L),
    e.ctx.$onApplyOptions && e.ctx.$onApplyOptions(t, e, n));
}
function ls(e, t, n) {
  rr(f(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function fs(e, t, n, o) {
  const r = o.includes(".") ? Rr(n, o) : () => n[o];
  if (g(e)) {
    const n = t[e];
    h(n) && Ir(r, n);
  } else if (h(e)) Ir(r, e.bind(n));
  else if (v(e))
    if (f(e)) e.forEach((e) => fs(e, t, n, o));
    else {
      const o = h(e.handler) ? e.handler.bind(n) : t[e.handler];
      h(o) && Ir(r, o, e);
    }
}
function ps(e) {
  const t = e.type,
    { mixins: n, extends: o } = t,
    {
      mixins: r,
      optionsCache: s,
      config: { optionMergeStrategies: i },
    } = e.appContext,
    c = s.get(t);
  let u;
  return (
    c
      ? (u = c)
      : r.length || n || o
        ? ((u = {}), r.length && r.forEach((e) => ds(u, e, i, !0)), ds(u, t, i))
        : (u = t),
    v(t) && s.set(t, u),
    u
  );
}
function ds(e, t, n, o = !1) {
  const { mixins: r, extends: s } = t;
  (s && ds(e, s, n, !0), r && r.forEach((t) => ds(e, t, n, !0)));
  for (const i in t)
    if (o && "expose" === i);
    else {
      const o = hs[i] || (n && n[i]);
      e[i] = o ? o(e[i], t[i]) : t[i];
    }
  return e;
}
const hs = {
  data: gs,
  props: ys,
  emits: ys,
  methods: _s,
  computed: _s,
  beforeCreate: vs,
  created: vs,
  beforeMount: vs,
  mounted: vs,
  beforeUpdate: vs,
  updated: vs,
  beforeDestroy: vs,
  beforeUnmount: vs,
  destroyed: vs,
  unmounted: vs,
  activated: vs,
  deactivated: vs,
  errorCaptured: vs,
  serverPrefetch: vs,
  components: _s,
  directives: _s,
  watch: function (e, t) {
    if (!e) return t;
    if (!t) return e;
    const n = c(Object.create(null), e);
    for (const o in t) n[o] = vs(e[o], t[o]);
    return n;
  },
  provide: gs,
  inject: function (e, t) {
    return _s(ms(e), ms(t));
  },
};
function gs(e, t) {
  return t
    ? e
      ? function () {
          return c(
            h(e) ? e.call(this, this) : e,
            h(t) ? t.call(this, this) : t,
          );
        }
      : t
    : e;
}
function ms(e) {
  if (f(e)) {
    const t = {};
    for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
    return t;
  }
  return e;
}
function vs(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
function _s(e, t) {
  return e ? c(Object.create(null), e, t) : t;
}
function ys(e, t) {
  return e
    ? f(e) && f(t)
      ? [...new Set([...e, ...t])]
      : c(Object.create(null), cs(e), cs(null != t ? t : {}))
    : t;
}
function xs(e, t, n, o = !1) {
  const r = {},
    s = {};
  ((e.propsDefaults = Object.create(null)), bs(e, t, r, s));
  for (const i in e.propsOptions[0]) i in r || (r[i] = void 0);
  (n
    ? (e.props = o ? r : Do(r, !1, uo, Co, jo))
    : e.type.props
      ? (e.props = r)
      : (e.props = s),
    (e.attrs = s));
}
function bs(e, n, o, r) {
  const [s, i] = e.propsOptions;
  let c,
    u = !1;
  if (n)
    for (let t in n) {
      if ($(t)) continue;
      const a = n[t];
      let f;
      s && l(s, (f = O(t)))
        ? i && i.includes(f)
          ? ((c || (c = {}))[f] = a)
          : (o[f] = a)
        : Or(e.emitsOptions, t) ||
          (t in r && a === r[t]) ||
          ((r[t] = ws(e, t, a)), (u = !0));
    }
  if (i) {
    const n = Bo(o),
      r = c || t;
    for (let t = 0; t < i.length; t++) {
      const c = i[t];
      o[c] = $s(s, n, c, r[c], e, !l(r, c));
    }
  }
  return u;
}
function ws(e, t, n) {
  return n;
}
function $s(e, t, n, o, r, s) {
  const i = (function (e, t, n, o, r, s) {
    const i = e[n];
    if (null != i) {
      const e = l(i, "default");
      if (e && void 0 === o) {
        const e = i.default;
        if (i.type !== Function && !i.skipFactory && h(e)) {
          const { propsDefaults: s } = r;
          if (n in s) o = s[n];
          else {
            const i = Ds(r);
            ((o = s[n] = e.call(null, t)), i());
          }
        } else o = e;
      }
      i[0] &&
        (s && !e ? (o = !1) : !i[1] || ("" !== o && o !== E(n)) || (o = !0));
    }
    return o;
  })(e, t, n, o, r, s);
  return i;
}
function Ss(e, o, r = !1) {
  const s = o.propsCache,
    i = s.get(e);
  if (i) return i;
  const u = e.props,
    a = {},
    p = [];
  let d = !1;
  if (!h(e)) {
    const t = (e) => {
      d = !0;
      const [t, n] = Ss(e, o, !0);
      (c(a, t), n && p.push(...n));
    };
    (!r && o.mixins.length && o.mixins.forEach(t),
      e.extends && t(e.extends),
      e.mixins && e.mixins.forEach(t));
  }
  if (!u && !d) return (v(e) && s.set(e, n), n);
  if (f(u))
    for (let n = 0; n < u.length; n++) {
      const e = O(u[n]);
      ks(e) && (a[e] = t);
    }
  else if (u)
    for (const t in u) {
      const e = O(t);
      if (ks(e)) {
        const n = u[t],
          o = (a[e] = f(n) || h(n) ? { type: n } : c({}, n));
        if (o) {
          const t = Es(Boolean, o.type),
            n = Es(String, o.type);
          ((o[0] = t > -1),
            (o[1] = n < 0 || t < n),
            (t > -1 || l(o, "default")) && p.push(e));
        }
      }
    }
  const g = [a, p];
  return (v(e) && s.set(e, g), g);
}
function ks(e) {
  return "$" !== e[0] && !$(e);
}
function Os(e) {
  if (null === e) return "null";
  if ("function" == typeof e) return e.name || "";
  if ("object" == typeof e) {
    return (e.constructor && e.constructor.name) || "";
  }
  return "";
}
function Ps(e, t) {
  return Os(e) === Os(t);
}
function Es(e, t) {
  return f(t) ? t.findIndex((t) => Ps(t, e)) : h(t) && Ps(t, e) ? 0 : -1;
}
const Cs = yr;
function As(e) {
  return e ? (No((t = e)) || Ho(t) || "__vInternal" in e ? c({}, e) : e) : null;
  var t;
}
const Is = Vr();
let js = 0;
function Ls(e, n, o) {
  const r = e.type,
    s = (n ? n.appContext : e.appContext) || Is,
    i = {
      uid: js++,
      vnode: e,
      type: r,
      parent: n,
      appContext: s,
      root: null,
      next: null,
      subTree: null,
      effect: null,
      update: null,
      scope: new En(!0),
      render: null,
      proxy: null,
      exposed: null,
      exposeProxy: null,
      withProxy: null,
      provides: n ? n.provides : Object.create(s.provides),
      accessCache: null,
      renderCache: [],
      components: null,
      directives: null,
      propsOptions: Ss(r, s),
      emitsOptions: kr(r, s),
      emit: null,
      emitted: null,
      propsDefaults: t,
      inheritAttrs: r.inheritAttrs,
      ctx: t,
      data: t,
      props: t,
      attrs: t,
      slots: t,
      refs: t,
      setupState: t,
      setupContext: null,
      attrsProxy: null,
      slotsProxy: null,
      suspense: o,
      suspenseId: o ? o.pendingId : 0,
      asyncDep: null,
      asyncResolved: !1,
      isMounted: !1,
      isUnmounted: !1,
      isDeactivated: !1,
      bc: null,
      c: null,
      bm: null,
      m: null,
      bu: null,
      u: null,
      um: null,
      bum: null,
      da: null,
      a: null,
      rtg: null,
      rtc: null,
      ec: null,
      sp: null,
      $uniElements: new Map(),
      $templateUniElementRefs: [],
      $templateUniElementStyles: {},
      $eS: {},
      $eA: {},
    };
  return (
    (i.ctx = { _: i }),
    (i.root = n ? n.root : i),
    (i.emit = Sr.bind(null, i)),
    e.ce && e.ce(i),
    i
  );
}
let Rs = null;
const Ms = () => Rs || Pr;
let Vs, Ts;
((Vs = (e) => {
  Rs = e;
}),
  (Ts = (e) => {
    Us = e;
  }));
const Ds = (e) => {
    const t = Rs;
    return (
      Vs(e),
      e.scope.on(),
      () => {
        (e.scope.off(), Vs(t));
      }
    );
  },
  Ns = () => {
    (Rs && Rs.scope.off(), Vs(null));
  };
function Hs(e) {
  return 4 & e.vnode.shapeFlag;
}
let Us = !1;
function Bs(e, t = !1) {
  t && Ts(t);
  const { props: n } = e.vnode,
    o = Hs(e);
  xs(e, n, o, t);
  const r = o
    ? (function (e) {
        const t = e.type;
        ((e.accessCache = Object.create(null)),
          (e.proxy = Wo(new Proxy(e.ctx, is))));
        const { setup: n } = t;
        if (n) {
          const t = (e.setupContext =
              n.length > 1
                ? (function (e) {
                    const t = (t) => {
                      e.exposed = t || {};
                    };
                    return {
                      get attrs() {
                        return (function (e) {
                          return (
                            e.attrsProxy ||
                            (e.attrsProxy = new Proxy(e.attrs, {
                              get: (t, n) => (Jn(e, 0, "$attrs"), t[n]),
                            }))
                          );
                        })(e);
                      },
                      slots: e.slots,
                      emit: e.emit,
                      expose: t,
                    };
                  })(e)
                : null),
            o = Ds(e);
          Nn();
          const r = or(n, e, 0, [e.props, t]);
          (Hn(),
            o(),
            _(r)
              ? r.then(Ns, Ns)
              : (function (e, t) {
                  h(t) ? (e.render = t) : v(t) && (e.setupState = er(t));
                  Ws(e);
                })(e, r));
        } else Ws(e);
      })(e)
    : void 0;
  return (t && Ts(!1), r);
}
function Ws(e, t, n) {
  const r = e.type;
  e.render || (e.render = r.render || o);
  {
    const t = Ds(e);
    Nn();
    try {
      as(e);
    } finally {
      (Hn(), t());
    }
  }
}
function zs(e) {
  if (e.exposed)
    return (
      e.exposeProxy ||
      (e.exposeProxy = new Proxy(er(Wo(e.exposed)), {
        get: (t, n) => (n in t ? t[n] : e.proxy[n]),
        has: (e, t) => t in e || t in rs,
      }))
    );
}
const Fs = (e, t) => {
    const n = (function (e, t, n = !1) {
      let r, s;
      const i = h(e);
      return (
        i ? ((r = e), (s = o)) : ((r = e.get), (s = e.set)),
        new Xo(r, s, i || !s, n)
      );
    })(e, 0, Us);
    return n;
  },
  Xs = "3.4.21";
function Ks(e) {
  return Qo(e);
}
const qs = "[object Array]",
  Gs = "[object Object]";
function Js(e, t) {
  const n = {};
  return (Zs(e, t), Qs(e, t, "", n), n);
}
function Zs(e, t) {
  if ((e = Ks(e)) === t) return;
  const n = x(e),
    o = x(t);
  if (n == Gs && o == Gs)
    for (let r in t) {
      const n = e[r];
      void 0 === n ? (e[r] = null) : Zs(n, t[r]);
    }
  else
    n == qs &&
      o == qs &&
      e.length >= t.length &&
      t.forEach((t, n) => {
        Zs(e[n], t);
      });
}
function Qs(e, t, n, o) {
  if ((e = Ks(e)) === t) return;
  const r = x(e),
    s = x(t);
  if (r == Gs)
    if (s != Gs || Object.keys(e).length < Object.keys(t).length) Ys(o, n, e);
    else
      for (let i in e) {
        const r = Ks(e[i]),
          s = t[i],
          c = x(r),
          u = x(s);
        if (c != qs && c != Gs)
          r != s && Ys(o, ("" == n ? "" : n + ".") + i, r);
        else if (c == qs)
          u != qs || r.length < s.length
            ? Ys(o, ("" == n ? "" : n + ".") + i, r)
            : r.forEach((e, t) => {
                Qs(e, s[t], ("" == n ? "" : n + ".") + i + "[" + t + "]", o);
              });
        else if (c == Gs)
          if (u != Gs || Object.keys(r).length < Object.keys(s).length)
            Ys(o, ("" == n ? "" : n + ".") + i, r);
          else
            for (let e in r)
              Qs(r[e], s[e], ("" == n ? "" : n + ".") + i + "." + e, o);
      }
  else
    r == qs
      ? s != qs || e.length < t.length
        ? Ys(o, n, e)
        : e.forEach((e, r) => {
            Qs(e, t[r], n + "[" + r + "]", o);
          })
      : Ys(o, n, e);
}
function Ys(e, t, n) {
  e[t] = n;
}
function ei(e) {
  const t = e.ctx.__next_tick_callbacks;
  if (t && t.length) {
    const e = t.slice(0);
    t.length = 0;
    for (let t = 0; t < e.length; t++) e[t]();
  }
}
function ti(e, t) {
  const n = e.ctx;
  if (
    !n.__next_tick_pending &&
    !(function (e) {
      return ar.includes(e.update);
    })(e)
  )
    return mr(t && t.bind(e.proxy));
  let o;
  return (
    n.__next_tick_callbacks || (n.__next_tick_callbacks = []),
    n.__next_tick_callbacks.push(() => {
      t ? or(t.bind(e.proxy), e, 14) : o && o(e.proxy);
    }),
    new Promise((e) => {
      o = e;
    })
  );
}
function ni(e, t) {
  const n = typeof (e = Ks(e));
  if ("object" === n && null !== e) {
    let n = t.get(e);
    if (void 0 !== n) return n;
    if (f(e)) {
      const o = e.length;
      ((n = new Array(o)), t.set(e, n));
      for (let r = 0; r < o; r++) n[r] = ni(e[r], t);
    } else {
      ((n = {}), t.set(e, n));
      for (const o in e) l(e, o) && (n[o] = ni(e[o], t));
    }
    return n;
  }
  if ("symbol" !== n) return e;
}
function oi(e) {
  return ni(e, "undefined" != typeof WeakMap ? new WeakMap() : new Map());
}
function ri(e, t, n) {
  if (!t) return;
  (((t = oi(t)).$eS = e.$eS || {}), (t.$eA = e.$eA || {}));
  const o = e.ctx,
    r = o.mpType;
  if ("page" === r || "component" === r) {
    t.r0 = 1;
    const n = o.$scope,
      r = Js(
        t,
        (function (e, t) {
          const n = e.data,
            o = Object.create(null);
          return (
            t.forEach((e) => {
              o[e] = n[e];
            }),
            o
          );
        })(n, Object.keys(t)),
      );
    Object.keys(r).length
      ? ((o.__next_tick_pending = !0),
        n.setData(r, () => {
          ((o.__next_tick_pending = !1), ei(e));
        }),
        xr())
      : ei(e);
  }
}
function si(e, t, n) {
  t.appContext.config.globalProperties.$applyOptions(e, t, n);
  const o = e.computed;
  if (o) {
    const e = Object.keys(o);
    if (e.length) {
      const n = t.ctx;
      (n.$computedKeys || (n.$computedKeys = []), n.$computedKeys.push(...e));
    }
  }
  delete t.ctx.$onApplyOptions;
}
function ii(e, t = !1) {
  const {
    setupState: n,
    $templateRefs: o,
    $templateUniElementRefs: r,
    ctx: { $scope: s, $mpPlatform: i },
  } = e;
  if (!s || (!o && !r)) return;
  if (t)
    return (
      "mp-alipay" !== i && o && o.forEach((e) => ci(e, null, n)),
      void (r && r.forEach((e) => ci(e, null, n)))
    );
  const c = "mp-baidu" === i || "mp-toutiao" === i,
    u = (e) => {
      if (0 === e.length) return [];
      const t = (s.selectAllComponents(".r") || []).concat(
        s.selectAllComponents(".r-i-f") || [],
      );
      return e.filter((e) => {
        const o = (function (e, t) {
          const n = e.find((e) => e && (e.properties || e.props).uI === t);
          if (n) {
            const e = n.$vm;
            return e
              ? zs(e.$) || e
              : (function (e) {
                  v(e) && Wo(e);
                  return e;
                })(n);
          }
          return null;
        })(t, e.i);
        return !(!c || null !== o) || (ci(e, o, n), !1);
      });
    },
    a = () => {
      if (o) {
        const t = u(o);
        t.length &&
          e.proxy &&
          e.proxy.$scope &&
          e.proxy.$scope.setData({ r1: 1 }, () => {
            u(t);
          });
      }
    };
  ("mp-alipay" !== i && (s._$setRef ? s._$setRef(a) : ti(e, a)),
    r &&
      r.length &&
      ti(e, () => {
        r.forEach((e) => {
          f(e.v)
            ? e.v.forEach((t) => {
                ci(e, t, n);
              })
            : ci(e, e.v, n);
        });
      }));
}
function ci({ r: e, f: t }, n, o) {
  if (h(e)) e(n, {});
  else {
    const r = g(e),
      s = Go(e);
    if (r || s)
      if (t) {
        if (!s) return;
        f(e.value) || (e.value = []);
        const t = e.value;
        if (-1 === t.indexOf(n)) {
          if ((t.push(n), !n)) return;
          n.$ && Zr(() => u(t, n), n.$);
        }
      } else r ? l(o, e) && (o[e] = n) : Go(e) && (e.value = n);
  }
}
const ui = yr;
function ai(e, t) {
  const n = (e.component = Ls(e, t.parentComponent, null));
  return (
    (n.renderer = t.mpType ? t.mpType : "component"),
    (n.ctx.$onApplyOptions = si),
    (n.ctx.$children = []),
    "app" === t.mpType && (n.render = o),
    t.onBeforeSetup && t.onBeforeSetup(n, t),
    Bs(n),
    t.parentComponent &&
      n.proxy &&
      t.parentComponent.ctx.$children.push(zs(n) || n.proxy),
    (function (e) {
      const t = gi.bind(e);
      e.$updateScopedSlots = () => mr(() => vr(t));
      const n = () => {
          if (e.isMounted) {
            const { next: t, bu: n, u: o } = e;
            (mi(e, !1), hi(), n && j(n), mi(e, !0), ri(e, pi(e)), o && ui(o));
          } else
            (Zr(() => {
              ii(e, !0);
            }, e),
              ri(e, pi(e)));
        },
        r = (e.effect = new In(n, o, () => vr(s), e.scope)),
        s = (e.update = () => {
          r.dirty && r.run();
        });
      ((s.id = e.uid), mi(e, !0), s());
    })(n),
    n.proxy
  );
}
const li = (e) => {
  let t;
  for (const n in e)
    ("class" === n || "style" === n || s(n)) && ((t || (t = {}))[n] = e[n]);
  return t;
};
function fi(e) {
  return e
    ? e.filter((e) => {
        const t = e.v;
        return !(
          !t ||
          "object" != typeof t ||
          !["UNI-LOADING-ELEMENT", "UNI-CLOUD-DB-ELEMENT"].includes(t.nodeName)
        );
      })
    : [];
}
function pi(e) {
  const {
    type: t,
    vnode: n,
    proxy: o,
    withProxy: r,
    props: s,
    propsOptions: [i],
    slots: c,
    attrs: u,
    emit: a,
    render: l,
    renderCache: f,
    data: p,
    setupState: d,
    ctx: h,
    uid: g,
    appContext: {
      app: {
        config: {
          globalProperties: { pruneComponentPropsCache: m },
        },
      },
    },
    inheritAttrs: v,
  } = e;
  let _;
  ((e.$uniElementIds = new Map()),
    (e.$templateRefs = fi(e.$templateRefs || [])),
    (e.$templateUniElementRefs = fi(e.$templateUniElementRefs || [])),
    (e.$templateUniElementStyles = {}),
    (e.$ei = 0),
    m(g),
    (e.__counter = 0 === e.__counter ? 1 : 0));
  const y = Er(e);
  try {
    if (4 & n.shapeFlag) {
      di(v, s, i, u);
      const e = r || o;
      _ = l.call(e, e, f, s, d, p, h);
    } else {
      di(v, s, i, t.props ? u : li(u));
      const e = t;
      _ = e.length > 1 ? e(s, { attrs: u, slots: c, emit: a }) : e(s, null);
    }
  } catch (x) {
    (sr(x, e, 1), (_ = !1));
  }
  return (ii(e), Er(y), _);
}
function di(e, t, n, o) {
  if (t && o && !1 !== e) {
    const e = Object.keys(o).filter((e) => "class" !== e && "style" !== e);
    if (!e.length) return;
    n && e.some(i)
      ? e.forEach((e) => {
          (i(e) && e.slice(9) in n) || (t[e] = o[e]);
        })
      : e.forEach((e) => (t[e] = o[e]));
  }
}
const hi = (e) => {
  (Nn(), xr(), Hn());
};
function gi() {
  const e = this.$scopedSlotsData;
  if (!e || 0 === e.length) return;
  const t = this.ctx.$scope,
    n = t.data,
    o = Object.create(null);
  (e.forEach(({ path: e, index: t, data: r }) => {
    const s = ye(n, e),
      i = g(t) ? `${e}.${t}` : `${e}[${t}]`;
    if (void 0 === s || void 0 === s[t]) o[i] = r;
    else {
      const e = Js(r, s[t]);
      Object.keys(e).forEach((t) => {
        o[i + "." + t] = e[t];
      });
    }
  }),
    (e.length = 0),
    Object.keys(o).length && t.setData(o));
}
function mi({ effect: e, update: t }, n) {
  e.allowRecurse = t.allowRecurse = n;
}
const vi = function (e, t = null) {
  (h(e) || (e = c({}, e)), null == t || v(t) || (t = null));
  const n = Vr(),
    o = new WeakSet(),
    r = (n.app = {
      _uid: Tr++,
      _component: e,
      _props: t,
      _container: null,
      _context: n,
      _instance: null,
      version: Xs,
      get config() {
        return n.config;
      },
      set config(e) {},
      use: (e, ...t) => (
        o.has(e) ||
          (e && h(e.install)
            ? (o.add(e), e.install(r, ...t))
            : h(e) && (o.add(e), e(r, ...t))),
        r
      ),
      mixin: (e) => (n.mixins.includes(e) || n.mixins.push(e), r),
      component: (e, t) => (t ? ((n.components[e] = t), r) : n.components[e]),
      directive: (e, t) => (t ? ((n.directives[e] = t), r) : n.directives[e]),
      mount() {},
      unmount() {},
      provide: (e, t) => ((n.provides[e] = t), r),
      runWithContext(e) {
        const t = Dr;
        Dr = r;
        try {
          return e();
        } finally {
          Dr = t;
        }
      },
    });
  return r;
};
function _i(e, t = null) {
  ("undefined" != typeof window
    ? window
    : "undefined" != typeof globalThis
      ? globalThis
      : "undefined" != typeof global
        ? global
        : "undefined" != typeof my
          ? my
          : void 0
  ).__VUE__ = !0;
  const n = vi(e, t),
    r = n._context;
  r.config.globalProperties.$nextTick = function (e) {
    return ti(this.$, e);
  };
  const s = (e) => ((e.appContext = r), (e.shapeFlag = 6), e),
    i = function (e, t) {
      return ai(s(e), t);
    },
    c = function (e) {
      return (
        e &&
        (function (e) {
          const { bum: t, scope: n, update: o, um: r } = e;
          t && j(t);
          {
            const t = e.parent;
            if (t) {
              const n = t.ctx.$children,
                o = zs(e) || e.proxy,
                r = n.indexOf(o);
              r > -1 && n.splice(r, 1);
            }
          }
          (n.stop(),
            o && (o.active = !1),
            r && ui(r),
            ui(() => {
              e.isUnmounted = !0;
            }));
        })(e.$)
      );
    };
  return (
    (n.mount = function () {
      e.render = o;
      const t = ai(s({ type: e }), {
        mpType: "app",
        mpInstance: null,
        parentComponent: null,
        slots: [],
        props: null,
      });
      return (
        (n._instance = t.$),
        (t.$app = n),
        (t.$createComponent = i),
        (t.$destroyComponent = c),
        (r.$appInstance = t),
        t
      );
    }),
    (n.unmount = function () {}),
    n
  );
}
function yi(e, t, n, o) {
  h(t) && Fr(e, t.bind(n), o);
}
function xi(e, t, n) {
  !(function (e, t, n) {
    const o = e.mpType || n.$mpType;
    !o ||
      "component" === o ||
      ("page" === o && "component" === t.renderer) ||
      Object.keys(e).forEach((o) => {
        if (ke(o, e[o], !1)) {
          const r = e[o];
          f(r) ? r.forEach((e) => yi(o, e, n, t)) : yi(o, r, n, t);
        }
      });
  })(e, t, n);
}
function bi(e, t, n) {
  return (e[t] = n);
}
function wi(e, ...t) {
  const n = this[e];
  return n ? n(...t) : (console.error(`method ${e} not found`), null);
}
function $i(e) {
  const t = e.config.errorHandler;
  return function (n, o, r) {
    t && t(n, o, r);
    const s = e._instance;
    if (!s || !s.proxy) throw n;
    s[B] ? s.proxy.$callHook(B, n) : ir(n, 0, o && o.$.vnode, !1);
  };
}
function Si(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
let ki;
const Oi = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  Pi = /^(?:[A-Za-z\d+/]{4})*?(?:[A-Za-z\d+/]{2}(?:==)?|[A-Za-z\d+/]{3}=?)?$/;
function Ei() {
  const e = kn.getStorageSync("uni_id_token") || "",
    t = e.split(".");
  if (!e || 3 !== t.length)
    return { uid: null, role: [], permission: [], tokenExpired: 0 };
  let n;
  try {
    n = JSON.parse(
      ((o = t[1]),
      decodeURIComponent(
        ki(o)
          .split("")
          .map(function (e) {
            return "%" + ("00" + e.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(""),
      )),
    );
  } catch (r) {
    throw new Error("获取当前用户信息出错，详细错误信息为：" + r.message);
  }
  var o;
  return ((n.tokenExpired = 1e3 * n.exp), delete n.exp, delete n.iat, n);
}
function Ci(e) {
  const t = e.config;
  var n;
  ((t.errorHandler = Ee(e, $i)),
    (n = t.optionMergeStrategies),
    $e.forEach((e) => {
      n[e] = Si;
    }));
  const o = t.globalProperties;
  (!(function (e) {
    ((e.uniIDHasRole = function (e) {
      const { role: t } = Ei();
      return t.indexOf(e) > -1;
    }),
      (e.uniIDHasPermission = function (e) {
        const { permission: t } = Ei();
        return this.uniIDHasRole("admin") || t.indexOf(e) > -1;
      }),
      (e.uniIDTokenValid = function () {
        const { tokenExpired: e } = Ei();
        return e > Date.now();
      }));
  })(o),
    (o.$set = bi),
    (o.$applyOptions = xi),
    (o.$callMethod = wi),
    kn.invokeCreateVueAppHook(e));
}
ki =
  "function" != typeof atob
    ? function (e) {
        if (((e = String(e).replace(/[\t\n\f\r ]+/g, "")), !Pi.test(e)))
          throw new Error(
            "Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.",
          );
        var t;
        e += "==".slice(2 - (3 & e.length));
        for (var n, o, r = "", s = 0; s < e.length; )
          ((t =
            (Oi.indexOf(e.charAt(s++)) << 18) |
            (Oi.indexOf(e.charAt(s++)) << 12) |
            ((n = Oi.indexOf(e.charAt(s++))) << 6) |
            (o = Oi.indexOf(e.charAt(s++)))),
            (r +=
              64 === n
                ? String.fromCharCode((t >> 16) & 255)
                : 64 === o
                  ? String.fromCharCode((t >> 16) & 255, (t >> 8) & 255)
                  : String.fromCharCode(
                      (t >> 16) & 255,
                      (t >> 8) & 255,
                      255 & t,
                    )));
        return r;
      }
    : atob;
const Ai = Object.create(null);
function Ii(e) {
  delete Ai[e];
}
function ji(e) {
  if (!e) return;
  const [t, n] = e.split(",");
  return Ai[t] ? Ai[t][parseInt(n)] : void 0;
}
var Li = {
  install(e) {
    (Ci(e), (e.config.globalProperties.pruneComponentPropsCache = Ii));
    const t = e.mount;
    e.mount = function (n) {
      const o = t.call(e, n),
        r = (function () {
          const e = "createApp";
          if ("undefined" != typeof global && void 0 !== global[e])
            return global[e];
          if ("undefined" != typeof my) return my[e];
        })();
      return (
        r
          ? r(o)
          : "undefined" != typeof createMiniProgramApp &&
            createMiniProgramApp(o),
        o
      );
    };
  },
};
function Ri(e, t) {
  const n = Ms(),
    r = n.ctx,
    s =
      void 0 === t ||
      ("mp-weixin" !== r.$mpPlatform &&
        "mp-qq" !== r.$mpPlatform &&
        "mp-xhs" !== r.$mpPlatform) ||
      (!g(t) && "number" != typeof t)
        ? ""
        : "_" + t,
    i = "e" + n.$ei++ + s,
    u = r.$scope;
  if (!e) return (delete u[i], i);
  const a = u[i];
  return (
    a
      ? (a.value = e)
      : (u[i] = (function (e, t) {
          const n = (e) => {
            var r;
            (r = e).type &&
              r.target &&
              ((r.preventDefault = o),
              (r.stopPropagation = o),
              (r.stopImmediatePropagation = o),
              l(r, "detail") || (r.detail = {}),
              l(r, "markerId") &&
                ((r.detail = "object" == typeof r.detail ? r.detail : {}),
                (r.detail.markerId = r.markerId)),
              b(r.detail) &&
                l(r.detail, "checked") &&
                !l(r.detail, "value") &&
                (r.detail.value = r.detail.checked),
              b(r.detail) && (r.target = c({}, r.target, r.detail)));
            let s = [e];
            (t &&
              t.ctx.$getTriggerEventDetail &&
              "number" == typeof e.detail &&
              (e.detail = t.ctx.$getTriggerEventDetail(e.detail)),
              e.detail && e.detail.__args__ && (s = e.detail.__args__));
            const i = n.value,
              u = () =>
                rr(
                  (function (e, t) {
                    if (f(t)) {
                      const n = e.stopImmediatePropagation;
                      return (
                        (e.stopImmediatePropagation = () => {
                          (n && n.call(e), (e._stopped = !0));
                        }),
                        t.map((e) => (t) => !t._stopped && e(t))
                      );
                    }
                    return t;
                  })(e, i),
                  t,
                  5,
                  s,
                ),
              a = e.target,
              p = !!a && !!a.dataset && "true" === String(a.dataset.eventsync);
            if (!Mi.includes(e.type) || p) {
              const t = u();
              if ("input" === e.type && (f(t) || _(t))) return;
              return t;
            }
            setTimeout(u);
          };
          return ((n.value = e), n);
        })(e, n)),
    i
  );
}
const Mi = [
  "tap",
  "longpress",
  "longtap",
  "transitionend",
  "animationstart",
  "animationiteration",
  "animationend",
  "touchforcechange",
];
const Vi = function (e, t = null) {
  return (e && (e.mpType = "app"), _i(e, t).use(Li));
};
const Ti = ["externalClasses"];
const Di = /_(.*)_worklet_factory_/;
function Ni(e, t) {
  const n = e.$children;
  for (let r = n.length - 1; r >= 0; r--) {
    const e = n[r];
    if (e.$scope._$vueId === t) return e;
  }
  let o;
  for (let r = n.length - 1; r >= 0; r--) if (((o = Ni(n[r], t)), o)) return o;
}
const Hi = [
  "createSelectorQuery",
  "createIntersectionObserver",
  "selectAllComponents",
  "selectComponent",
];
function Ui(e, t) {
  const n = e.ctx;
  ((n.mpType = t.mpType),
    (n.$mpType = t.mpType),
    (n.$mpPlatform = "mp-weixin"),
    (n.$scope = t.mpInstance),
    Object.defineProperties(n, {
      [me]: {
        get() {
          const e = this.$scope.data[me];
          return void 0 === e ? "" : e;
        },
      },
    }),
    (n.$mp = {}),
    (n._self = {}),
    (e.slots = {}),
    f(t.slots) &&
      t.slots.length &&
      (t.slots.forEach((t) => {
        e.slots[t] = !0;
      }),
      e.slots.d && (e.slots.default = !0)),
    (n.getOpenerEventChannel = function () {
      return t.mpInstance.getOpenerEventChannel();
    }),
    (n.$hasHook = Bi),
    (n.$callHook = Wi),
    (e.emit = (function (e, t) {
      return function (n, ...o) {
        const r = t.$scope;
        if (r && n) {
          const e = { __args__: o };
          r.triggerEvent(n, e);
        }
        return e.apply(this, [n, ...o]);
      };
    })(e.emit, n)));
}
function Bi(e) {
  const t = this.$[e];
  return !(!t || !t.length);
}
function Wi(e, t) {
  "mounted" === e && (Wi.call(this, "bm"), (this.$.isMounted = !0), (e = "m"));
  const n = this.$[e];
  return (
    n &&
    ((e, t) => {
      let n;
      for (let o = 0; o < e.length; o++) n = e[o](t);
      return n;
    })(n, t)
  );
}
const zi = [X, N, H, q, ee, oe, re, se, ae];
function Fi(e, t = new Set()) {
  if (e) {
    Object.keys(e).forEach((n) => {
      ke(n, e[n]) && t.add(n);
    });
    {
      const { extends: n, mixins: o } = e;
      (o && o.forEach((e) => Fi(e, t)), n && Fi(n, t));
    }
  }
  return t;
}
function Xi(e, t, n) {
  -1 !== n.indexOf(t) ||
    l(e, t) ||
    (e[t] = function (e) {
      return this.$vm && this.$vm.$callHook(t, e);
    });
}
const Ki = [K];
function qi(e, t, n = Ki) {
  t.forEach((t) => Xi(e, t, n));
}
function Gi(e, t, n = Ki) {
  Fi(t).forEach((t) => Xi(e, t, n));
}
const Ji = _e(() => {
  const e = [],
    t = h(getApp) && getApp({ allowDefault: !0 });
  if (t && t.$vm && t.$vm.$) {
    const n = t.$vm.$.appContext.mixins;
    if (f(n)) {
      const t = Object.keys(Se);
      n.forEach((n) => {
        t.forEach((t) => {
          l(n, t) && !e.includes(t) && e.push(t);
        });
      });
    }
  }
  return e;
});
const Zi = [N, H, B, W, z, F];
function Qi(e, t) {
  const n = e.$,
    o = {
      globalData: (e.$options && e.$options.globalData) || {},
      $vm: e,
      onLaunch(t) {
        this.$vm = e;
        const o = n.ctx;
        (this.$vm && o.$scope && o.$callHook) ||
          (Ui(n, { mpType: "app", mpInstance: this, slots: [] }),
          (o.globalData = this.globalData),
          e.$callHook(U, t));
      },
    },
    r = wx.$onErrorHandlers;
  (r &&
    (r.forEach((e) => {
      Fr(B, e, n);
    }),
    (r.length = 0)),
    (function (e) {
      const t = Jo(
        (function () {
          var e;
          let t = "";
          {
            const n =
              (null === (e = wx.getAppBaseInfo) || void 0 === e
                ? void 0
                : e.call(wx)) || wx.getSystemInfoSync();
            t = Re(n && n.language ? n.language : Le) || Le;
          }
          return t;
        })(),
      );
      Object.defineProperty(e, "$locale", {
        get: () => t.value,
        set(e) {
          t.value = e;
        },
      });
    })(e));
  const s = e.$.type;
  (qi(o, Zi), Gi(o, s));
  {
    const e = s.methods;
    e && c(o, e);
  }
  return o;
}
function Yi(e, t) {
  if (h(e.onLaunch)) {
    const t = wx.getLaunchOptionsSync && wx.getLaunchOptionsSync();
    e.onLaunch(t);
  }
  (h(e.onShow) &&
    wx.onAppShow &&
    wx.onAppShow((e) => {
      t.$callHook("onShow", e);
    }),
    h(e.onHide) &&
      wx.onAppHide &&
      wx.onAppHide((e) => {
        t.$callHook("onHide", e);
      }));
}
const ec = ["eO", "uR", "uRIF", "uI", "uT", "uP", "uS"];
function tc(e) {
  (e.properties || (e.properties = {}),
    c(
      e.properties,
      (function (e, t = !1) {
        const n = {};
        if (!t) {
          let e = function (e) {
            const t = Object.create(null);
            (e &&
              e.forEach((e) => {
                t[e] = !0;
              }),
              this.setData({ $slots: t }));
          };
          (ec.forEach((e) => {
            n[e] = { type: null, value: "" };
          }),
            (n.uS = { type: null, value: [] }),
            (n.uS.observer = e));
        }
        return (
          e.behaviors &&
            e.behaviors.includes("wx://form-field") &&
            ((e.properties && e.properties.name) ||
              (n.name = { type: null, value: "" }),
            (e.properties && e.properties.value) ||
              (n.value = { type: null, value: "" })),
          n
        );
      })(e),
      (function (e) {
        const t = {};
        return (
          e &&
            e.virtualHost &&
            ((t.virtualHostStyle = { type: null, value: "" }),
            (t.virtualHostClass = { type: null, value: "" }),
            (t.virtualHostHidden = { type: null, value: "" }),
            (t[me] = { type: null, value: "" })),
          t
        );
      })(e.options),
    ));
}
const nc = [String, Number, Boolean, Object, Array, null];
function oc(e, t) {
  const n = (function (e) {
    return f(e) && 1 === e.length ? e[0] : e;
  })(e);
  return -1 !== nc.indexOf(n) ? n : null;
}
function rc(e, t) {
  return (
    (t
      ? (function (e) {
          const t = {};
          b(e) &&
            Object.keys(e).forEach((n) => {
              -1 === ec.indexOf(n) && (t[n] = e[n]);
            });
          return t;
        })(e)
      : ji(e.uP)) || {}
  );
}
function sc(e) {
  const t = function () {
    const e = this.properties.uP;
    e &&
      (this.$vm
        ? (function (e, t) {
            const n = Bo(t.props),
              o = ji(e) || {};
            ic(n, o) &&
              (!(function (e, t, n) {
                const {
                    props: o,
                    attrs: r,
                    vnode: { patchFlag: s },
                  } = e,
                  i = Bo(o),
                  [c] = e.propsOptions;
                let u = !1;
                if (s > 0 && !(16 & s)) {
                  if (8 & s) {
                    const n = e.vnode.dynamicProps;
                    for (let s = 0; s < n.length; s++) {
                      let a = n[s];
                      if (Or(e.emitsOptions, a)) continue;
                      const f = t[a];
                      if (c)
                        if (l(r, a))
                          f !== r[a] && ((r[a] = ws(0, 0, f)), (u = !0));
                        else {
                          const t = O(a);
                          o[t] = $s(c, i, t, f, e, !1);
                        }
                      else f !== r[a] && ((r[a] = ws(0, 0, f)), (u = !0));
                    }
                  }
                } else {
                  let s;
                  bs(e, t, o, r) && (u = !0);
                  for (const r in i)
                    (t && (l(t, r) || ((s = E(r)) !== r && l(t, s)))) ||
                      (c
                        ? !n ||
                          (void 0 === n[r] && void 0 === n[s]) ||
                          (o[r] = $s(c, i, r, void 0, e, !0))
                        : delete o[r]);
                  if (r !== i)
                    for (const e in r)
                      (t && l(t, e)) || (delete r[e], (u = !0));
                }
                u && Zn(e, "set", "$attrs");
              })(t, o, n),
              (r = t.update),
              ar.indexOf(r) > -1 &&
                (function (e) {
                  const t = ar.indexOf(e);
                  t > lr && ar.splice(t, 1);
                })(t.update),
              t.update());
            var r;
          })(e, this.$vm.$)
        : "m" === this.properties.uT &&
          (function (e, t) {
            const n = t.properties,
              o = ji(e) || {};
            ic(n, o, !1) && t.setData(o);
          })(e, this));
  };
  (e.observers || (e.observers = {}), (e.observers.uP = t));
}
function ic(e, t, n = !0) {
  const o = Object.keys(t);
  if (n && o.length !== Object.keys(e).length) return !0;
  for (let r = 0; r < o.length; r++) {
    const n = o[r];
    if (t[n] !== e[n]) return !0;
  }
  return !1;
}
function cc(e, t) {
  ((e.data = {}),
    (e.behaviors = (function (e) {
      const t = e.behaviors;
      let n = e.props;
      n || (e.props = n = []);
      const o = [];
      return (
        f(t) &&
          t.forEach((e) => {
            (o.push(e.replace("uni://", "wx://")),
              "uni://form-field" === e &&
                (f(n)
                  ? (n.push("name"), n.push("modelValue"))
                  : ((n.name = { type: String, default: "" }),
                    (n.modelValue = {
                      type: [String, Number, Boolean, Array, Object, Date],
                      default: "",
                    }))));
          }),
        o
      );
    })(t)));
}
function uc(
  e,
  {
    parse: t,
    mocks: n,
    isPage: o,
    isPageInProject: r,
    initRelation: s,
    handleLink: i,
    initLifetimes: u,
  },
) {
  e = e.default || e;
  const a = { multipleSlots: !0, addGlobalClass: !0, pureDataPattern: /^uP$/ };
  (f(e.mixins) &&
    e.mixins.forEach((e) => {
      v(e.options) && c(a, e.options);
    }),
    e.options && c(a, e.options));
  const p = {
    options: a,
    lifetimes: u({ mocks: n, isPage: o, initRelation: s, vueOptions: e }),
    pageLifetimes: {
      show() {
        this.$vm && this.$vm.$callHook("onPageShow");
      },
      hide() {
        this.$vm && this.$vm.$callHook("onPageHide");
      },
      resize(e) {
        this.$vm && this.$vm.$callHook("onPageResize", e);
      },
    },
    methods: { __l: i },
  };
  var d, h, g, m;
  return (
    cc(p, e),
    tc(p),
    sc(p),
    (function (e, t) {
      Ti.forEach((n) => {
        l(t, n) && (e[n] = t[n]);
      });
    })(p, e),
    (d = p.methods),
    (h = e.wxsCallMethods),
    f(h) &&
      h.forEach((e) => {
        d[e] = function (t) {
          return this.$vm[e](t);
        };
      }),
    (g = p.methods),
    (m = e.methods) &&
      Object.keys(m).forEach((e) => {
        const t = e.match(Di);
        if (t) {
          const n = t[1];
          ((g[e] = m[e]), (g[n] = m[n]));
        }
      }),
    t && t(p, { handleLink: i }),
    p
  );
}
let ac, lc;
function fc() {
  return getApp().$vm;
}
function pc(e, t) {
  const {
      parse: n,
      mocks: o,
      isPage: r,
      initRelation: s,
      handleLink: i,
      initLifetimes: c,
    } = t,
    u = uc(e, {
      mocks: o,
      isPage: r,
      isPageInProject: !0,
      initRelation: s,
      handleLink: i,
      initLifetimes: c,
    });
  !(function ({ properties: e }, t) {
    f(t)
      ? t.forEach((t) => {
          e[t] = { type: String, value: "" };
        })
      : b(t) &&
        Object.keys(t).forEach((n) => {
          const o = t[n];
          if (b(o)) {
            let t = o.default;
            h(t) && (t = t());
            const r = o.type;
            ((o.type = oc(r)), (e[n] = { type: o.type, value: t }));
          } else e[n] = { type: oc(o) };
        });
  })(u, (e.default || e).props);
  const a = u.methods;
  return (
    (a.onLoad = function (e) {
      var t;
      return (
        (this.options = e),
        (this.$page = {
          fullPath:
            ((t = this.route + be(e)),
            (function (e) {
              return 0 === e.indexOf("/");
            })(t)
              ? t
              : "/" + t),
        }),
        this.$vm && this.$vm.$callHook(X, e)
      );
    }),
    qi(a, zi),
    Gi(a, e),
    (function (e, t) {
      if (!t) return;
      Object.keys(Se).forEach((n) => {
        t & Se[n] && Xi(e, n, []);
      });
    })(a, e.__runtimeHooks),
    qi(a, Ji()),
    n && n(u, { handleLink: i }),
    u
  );
}
const dc = Page,
  hc = Component;
function gc(e) {
  const t = e.triggerEvent,
    n = function (n, ...o) {
      return t.apply(e, [((r = n), O(r.replace(ve, "-"))), ...o]);
      var r;
    };
  try {
    e.triggerEvent = n;
  } catch (o) {
    e._triggerEvent = n;
  }
}
function mc(e, t, n) {
  const o = t[e];
  t[e] = o
    ? function (...e) {
        return (gc(this), o.apply(this, e));
      }
    : function () {
        gc(this);
      };
}
((Page = function (e) {
  return (mc(X, e), dc(e));
}),
  (Component = function (e) {
    mc("created", e);
    return ((e.properties && e.properties.uP) || (tc(e), sc(e)), hc(e));
  }));
var vc = Object.freeze({
  __proto__: null,
  handleLink: function (e) {
    const t = e.detail || e.value,
      n = t.vuePid;
    let o;
    (n && (o = Ni(this.$vm, n)), o || (o = this.$vm), (t.parent = o));
  },
  initLifetimes: function ({
    mocks: e,
    isPage: t,
    initRelation: n,
    vueOptions: o,
  }) {
    return {
      attached() {
        let r = this.properties;
        !(function (e, t) {
          if (!e) return;
          const n = e.split(","),
            o = n.length;
          1 === o
            ? (t._$vueId = n[0])
            : 2 === o && ((t._$vueId = n[0]), (t._$vuePid = n[1]));
        })(r.uI, this);
        const s = { vuePid: this._$vuePid };
        n(this, s);
        const i = this,
          c = t(i);
        let u = r;
        ((this.$vm = (function (e, t) {
          ac || (ac = fc().$createComponent);
          const n = ac(e, t);
          return zs(n.$) || n;
        })(
          { type: o, props: rc(u, c) },
          {
            mpType: c ? "page" : "component",
            mpInstance: i,
            slots: r.uS || {},
            parentComponent: s.parent && s.parent.$,
            onBeforeSetup(t, n) {
              (!(function (e, t) {
                Object.defineProperty(e, "refs", {
                  get() {
                    const e = {};
                    return (
                      (function (e, t, n) {
                        e.selectAllComponents(t).forEach((e) => {
                          const t = e.properties.uR;
                          n[t] = e.$vm || e;
                        });
                      })(t, ".r", e),
                      t.selectAllComponents(".r-i-f").forEach((t) => {
                        const n = t.properties.uR;
                        n && (e[n] || (e[n] = []), e[n].push(t.$vm || t));
                      }),
                      e
                    );
                  },
                });
              })(t, i),
                (function (e, t, n) {
                  const o = e.ctx;
                  n.forEach((n) => {
                    l(t, n) && (e[n] = o[n] = t[n]);
                  });
                })(t, i, e),
                (function (e, t) {
                  Ui(e, t);
                  const n = e.ctx;
                  Hi.forEach((e) => {
                    n[e] = function (...t) {
                      const o = n.$scope;
                      if (o && o[e]) return o[e].apply(o, t);
                    };
                  });
                })(t, n));
            },
          },
        )),
          c ||
            (function (e) {
              const t = e.$options;
              f(t.behaviors) &&
                t.behaviors.includes("uni://form-field") &&
                e.$watch(
                  "modelValue",
                  () => {
                    e.$scope &&
                      e.$scope.setData({ name: e.name, value: e.modelValue });
                  },
                  { immediate: !0 },
                );
            })(this.$vm));
      },
      ready() {
        this.$vm && (this.$vm.$callHook("mounted"), this.$vm.$callHook(K));
      },
      detached() {
        var e;
        this.$vm &&
          (Ii(this.$vm.$.uid),
          (e = this.$vm),
          lc || (lc = fc().$destroyComponent),
          lc(e));
      },
    };
  },
  initRelation: function (e, t) {
    e.triggerEvent("__l", t);
  },
  isPage: function (e) {
    return !!e.route;
  },
  mocks: ["__route__", "__wxExparserNodeId__", "__wxWebviewId__"],
});
const _c = function (e) {
    return App(Qi(e));
  },
  yc =
    ((xc = vc),
    function (e) {
      return Component(pc(e, xc));
    });
var xc;
const bc = (function (e) {
    return function (t) {
      return Component(uc(t, e));
    };
  })(vc),
  wc = function (e) {
    Yi(Qi(e), e);
  },
  $c = function (e) {
    const t = Qi(e),
      n = h(getApp) && getApp({ allowDefault: !0 });
    if (!n) return;
    e.$.ctx.$scope = n;
    const o = n.globalData;
    (o &&
      Object.keys(t.globalData).forEach((e) => {
        l(o, e) || (o[e] = t.globalData[e]);
      }),
      Object.keys(t).forEach((e) => {
        l(n, e) || (n[e] = t[e]);
      }),
      Yi(t, e));
  };
/*!
 * pinia v2.3.1
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let Sc;
(!(function () {
  if (h(wx.preloadAssets)) {
    const e = String.fromCharCode(
      99,
      100,
      110,
      49,
      46,
      100,
      99,
      108,
      111,
      117,
      100,
      46,
      110,
      101,
      116,
      46,
      99,
      110,
    );
    setTimeout(() => {
      wx.preloadAssets({
        data: [
          {
            type: "image",
            src:
              "https://" +
              e +
              "/57466859574668595743556c643367774d5455315a47466c4d7a59774d32566b4e545269/img/shadow-grey.png",
          },
        ],
      });
    }, 3e3);
  }
})(),
  (wx.createApp = global.createApp = _c),
  (wx.createPage = yc),
  (wx.createComponent = bc),
  (wx.createPluginApp = global.createPluginApp = wc),
  (wx.createSubpackageApp = global.createSubpackageApp = $c));
const kc = (e) => (Sc = e),
  Oc = Symbol();
function Pc(e) {
  return (
    e &&
    "object" == typeof e &&
    "[object Object]" === Object.prototype.toString.call(e) &&
    "function" != typeof e.toJSON
  );
}
var Ec, Cc;
(((Cc = Ec || (Ec = {})).direct = "direct"),
  (Cc.patchObject = "patch object"),
  (Cc.patchFunction = "patch function"));
const Ac = () => {};
function Ic(e, t, n, o = Ac) {
  e.push(t);
  const r = () => {
    const n = e.indexOf(t);
    n > -1 && (e.splice(n, 1), o());
  };
  return (
    !n &&
      An() &&
      (function (e) {
        On && On.cleanups.push(e);
      })(r),
    r
  );
}
function jc(e, ...t) {
  e.slice().forEach((e) => {
    e(...t);
  });
}
const Lc = (e) => e(),
  Rc = Symbol(),
  Mc = Symbol();
function Vc(e, t) {
  e instanceof Map && t instanceof Map
    ? t.forEach((t, n) => e.set(n, t))
    : e instanceof Set && t instanceof Set && t.forEach(e.add, e);
  for (const n in t) {
    if (!t.hasOwnProperty(n)) continue;
    const o = t[n],
      r = e[n];
    Pc(r) && Pc(o) && e.hasOwnProperty(n) && !Go(o) && !No(o)
      ? (e[n] = Vc(r, o))
      : (e[n] = o);
  }
  return e;
}
const Tc = Symbol();
function Dc(e) {
  return !Pc(e) || !e.hasOwnProperty(Tc);
}
const { assign: Nc } = Object;
function Hc(e) {
  return !(!Go(e) || !e.effect);
}
function Uc(e, t, n, o) {
  const { state: r, actions: s, getters: i } = t,
    c = n.state.value[e];
  let u;
  return (
    (u = Bc(
      e,
      function () {
        c || (n.state.value[e] = r ? r() : {});
        const t = (function (e) {
          const t = f(e) ? new Array(e.length) : {};
          for (const n in e) t[n] = nr(e, n);
          return t;
        })(n.state.value[e]);
        return Nc(
          t,
          s,
          Object.keys(i || {}).reduce(
            (t, o) => (
              (t[o] = Wo(
                Fs(() => {
                  kc(n);
                  const t = n._s.get(e);
                  return i[o].call(t, t);
                }),
              )),
              t
            ),
            {},
          ),
        );
      },
      t,
      n,
      o,
      !0,
    )),
    u
  );
}
function Bc(e, t, n = {}, o, r, s) {
  let i;
  const c = Nc({ actions: {} }, n),
    u = { deep: !0 };
  let a,
    l,
    f,
    p = [],
    d = [];
  const h = o.state.value[e];
  let g;
  function m(t) {
    let n;
    ((a = l = !1),
      "function" == typeof t
        ? (t(o.state.value[e]),
          (n = { type: Ec.patchFunction, storeId: e, events: f }))
        : (Vc(o.state.value[e], t),
          (n = { type: Ec.patchObject, payload: t, storeId: e, events: f })));
    const r = (g = Symbol());
    (mr().then(() => {
      g === r && (a = !0);
    }),
      (l = !0),
      jc(p, n, o.state.value[e]));
  }
  (s || h || (o.state.value[e] = {}), Jo({}));
  const v = s
    ? function () {
        const { state: e } = n,
          t = e ? e() : {};
        this.$patch((e) => {
          Nc(e, t);
        });
      }
    : Ac;
  const _ = (t, n = "") => {
      if (Rc in t) return ((t[Mc] = n), t);
      const r = function () {
        kc(o);
        const n = Array.from(arguments),
          s = [],
          i = [];
        let c;
        jc(d, {
          args: n,
          name: r[Mc],
          store: y,
          after: function (e) {
            s.push(e);
          },
          onError: function (e) {
            i.push(e);
          },
        });
        try {
          c = t.apply(this && this.$id === e ? this : y, n);
        } catch (u) {
          throw (jc(i, u), u);
        }
        return c instanceof Promise
          ? c
              .then((e) => (jc(s, e), e))
              .catch((e) => (jc(i, e), Promise.reject(e)))
          : (jc(s, c), c);
      };
      return ((r[Rc] = !0), (r[Mc] = n), r);
    },
    y = Vo({
      _p: o,
      $id: e,
      $onAction: Ic.bind(null, d),
      $patch: m,
      $reset: v,
      $subscribe(t, n = {}) {
        const r = Ic(p, t, n.detached, () => s()),
          s = i.run(() =>
            Ir(
              () => o.state.value[e],
              (o) => {
                ("sync" === n.flush ? l : a) &&
                  t({ storeId: e, type: Ec.direct, events: f }, o);
              },
              Nc({}, u, n),
            ),
          );
        return r;
      },
      $dispose: function () {
        (i.stop(), (p = []), (d = []), o._s.delete(e));
      },
    });
  o._s.set(e, y);
  const x = ((o._a && o._a.runWithContext) || Lc)(() =>
    o._e.run(() => (i = Cn()).run(() => t({ action: _ }))),
  );
  for (const b in x) {
    const t = x[b];
    if ((Go(t) && !Hc(t)) || No(t))
      s ||
        (h && Dc(t) && (Go(t) ? (t.value = h[b]) : Vc(t, h[b])),
        (o.state.value[e][b] = t));
    else if ("function" == typeof t) {
      const e = _(t, b);
      ((x[b] = e), (c.actions[b] = t));
    }
  }
  return (
    Nc(y, x),
    Nc(Bo(y), x),
    Object.defineProperty(y, "$state", {
      get: () => o.state.value[e],
      set: (e) => {
        m((t) => {
          Nc(t, e);
        });
      },
    }),
    o._p.forEach((e) => {
      Nc(
        y,
        i.run(() => e({ store: y, app: o._a, pinia: o, options: c })),
      );
    }),
    h && s && n.hydrate && n.hydrate(y.$state, h),
    (a = !0),
    (l = !0),
    y
  );
}
/*! #__NO_SIDE_EFFECTS__ */ const Wc =
    (e, t = 0) =>
    (t, n = Ms()) => {
      !Us && Fr(e, t, n);
    },
  zc = Wc(N, 3),
  Fc = Wc(H, 3),
  Xc = Wc(U, 1),
  Kc = Wc(X, 2);
((exports._export_sfc = (e, t) => {
  const n = e.__vccOpts || e;
  for (const [o, r] of t) n[o] = r;
  return n;
}),
  (exports.computed = Fs),
  (exports.createPinia = function () {
    const e = Cn(!0),
      t = e.run(() => Jo({}));
    let n = [],
      o = [];
    const r = Wo({
      install(e) {
        (kc(r),
          (r._a = e),
          e.provide(Oc, r),
          (e.config.globalProperties.$pinia = r),
          o.forEach((e) => n.push(e)),
          (o = []));
      },
      use(e) {
        return (this._a ? n.push(e) : o.push(e), this);
      },
      _p: n,
      _a: null,
      _e: e,
      _s: new Map(),
      state: t,
    });
    return r;
  }),
  (exports.createSSRApp = Vi),
  (exports.defineComponent =
    /*! #__NO_SIDE_EFFECTS__ */
    function (e, t) {
      return h(e) ? (() => c({ name: e.name }, t, { setup: e }))() : e;
    }),
  (exports.defineStore = function (e, t, n) {
    let o, r;
    const s = "function" == typeof t;
    function i(e, n) {
      ((e = e || (!!(Rs || Pr || Dr) ? Nr(Oc, null) : null)) && kc(e),
        (e = Sc)._s.has(o) || (s ? Bc(o, t, r, e) : Uc(o, r, e)));
      return e._s.get(o);
    }
    return (
      "string" == typeof e ? ((o = e), (r = s ? n : t)) : ((r = e), (o = e.id)),
      (i.$id = o),
      i
    );
  }),
  (exports.e = (e, ...t) => c(e, ...t)),
  (exports.f = (e, t) =>
    (function (e, t) {
      let n;
      if (f(e) || g(e)) {
        n = new Array(e.length);
        for (let o = 0, r = e.length; o < r; o++) n[o] = t(e[o], o, o);
      } else if ("number" == typeof e) {
        n = new Array(e);
        for (let o = 0; o < e; o++) n[o] = t(o + 1, o, o);
      } else if (v(e))
        if (e[Symbol.iterator]) n = Array.from(e, (e, n) => t(e, n, n));
        else {
          const o = Object.keys(e);
          n = new Array(o.length);
          for (let r = 0, s = o.length; r < s; r++) {
            const s = o[r];
            n[r] = t(e[s], s, r);
          }
        }
      else n = [];
      return n;
    })(e, t)),
  (exports.index = kn),
  (exports.n = (e) => R(e)),
  (exports.o = (e, t) => Ri(e, t)),
  (exports.onHide = Fc),
  (exports.onLaunch = Xc),
  (exports.onLoad = Kc),
  (exports.onMounted = qr),
  (exports.onShow = zc),
  (exports.onUnmounted = Qr),
  (exports.p = (e) =>
    (function (e) {
      const { uid: t, __counter: n } = Ms();
      return t + "," + ((Ai[t] || (Ai[t] = [])).push(As(e)) - 1) + "," + n;
    })(e)),
  (exports.ref = Jo),
  (exports.resolveComponent = function (e, t) {
    return (
      (function (e, t, n = !0, o = !1) {
        const r = Pr || Rs;
        if (r) {
          const n = r.type;
          {
            const e = (function (e, t = !0) {
              return h(e) ? e.displayName || e.name : e.name || (t && e.__name);
            })(n, !1);
            if (e && (e === t || e === O(t) || e === C(O(t)))) return n;
          }
          const s = Cr(r[e] || n[e], t) || Cr(r.appContext[e], t);
          return !s && o ? n : s;
        }
      })("components", e, !0, t) || e
    );
  }),
  (exports.t = (e) => V(e)),
  (exports.unref = Qo));
