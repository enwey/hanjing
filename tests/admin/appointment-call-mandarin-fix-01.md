# 运营后台叫号普通话修复

- 日期：2026-10-24
- 状态：待回归
- 范围：预约列表、候诊队列、诊疗工作台、预约详情的叫号语音播报（`src/utils/speech.ts` 及四大业务入口）

## 1. 深度根因分析

此前叫号偶现或持续播放粤语的三个根本原因：
1. **语言代码下划线与连字符不一致**：macOS / WebKit 和部分系统返回的语言标识为 `zh_CN` 或 `zh_HK`（带下划线 `_`）。原代码直接使用 `voice.lang.toLowerCase() === 'zh-cn'` 和正则判断，导致语言匹配与过滤全部静默失效。
2. **系统默认粤语音色名称缺少关键词**：macOS 原生粤语音色名称为 `Sinji`（或 `Sin-ji`、`Hiugaai`），Windows 粤语音色为 `Danny`、`HiuMaan` 等，名字中均不含“粤语”或“Cantonese”字样，此前未纳入方言黑名单。
3. **Chromium 异步冷启动空列表竞态**：Chrome / Edge 等浏览器在页面初次加载或按钮首次点击时，`window.speechSynthesis.getVoices()` 同步返回空数组 `[]`。此时原方法返回 `undefined` 且未挂载音色，浏览器自动降级使用操作系统默认全局音色（导致在华南/粤语系统或默认系统音色下直接播报粤语）。

## 2. 改进实现

- **语言代码标准化**：通过 `normalizeLang` 统一将下划线替换为连字符（`zh_CN` -> `zh-cn`）。
- **完善方言排除黑名单**：扩充 `isCantoneseVoice`，显式排除 `yue`、`zh-hk`、`zh-mo`、`zh-yue` 以及 `sinji`、`sin-ji`、`hiugaai`、`hiumaan`、`wanlung`、`danny`、`tracy`、`hong kong` 等粤语音色。
- **多维度普通话音色评分系统**：引入 `rateMandarinVoice` 对候选音色打分：
  - 核心语言代码（`zh-cn`、`zh-hans-cn`、`cmn-hans-cn`）权重最高；
  - 优质普通话音色标识（`普通话`、`mandarin`、`Tingting/婷婷`、`Xiaoxiao/晓晓`、`Yunxi/云希`、`Huihui/慧慧` 等）加分；
  - 挑选最高分且严禁选择粤语。
- **模块加载预加载与冷启动异步容错**：
  - 模块导入时立即执行 `refreshVoices()` 并监听 `onvoiceschanged`；
  - 初次点击若语音列表仍为空，智能等待 `onvoiceschanged`（设置 150ms 超时保底），确保无论何时点击均能绑定纯正普通话音色。

## 3. 验证记录

- `node --test tests/admin/appointment-call-mandarin.test.mjs`：
  - `isCantoneseVoice` 跨平台粤语音色（macOS Sinji、Chrome 粤语、Windows Danny/HiuMaan）全量精准识别过滤通过；
  - `findMandarinVoice` 在 macOS（Tingting）、Chrome（Google 普通话）、Edge（Xiaoxiao）模拟环境中均精准选拔普通话音色通过；
  - 真实 Google Chrome CDP 自动化语音引擎验证通过，实测调用均绑定普通话音色（0 粤语）。
- 生产构建：Vite 打包构建通过（耗时 21.98s，产物 `dist/assets/speech-*.js` 正常生成）。
- 实际音频验证：待回归（开发自测与 CDP 自动化验证已完成，真实喇叭听辨待人工验收）。
