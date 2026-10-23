# AI 鼾声分析分贝计算非线性压缩缺陷修复记录

## 1. 任务背景与问题描述
- **用户反馈**：AI 鼾声录音在实际测试时对分贝检测严重失真：与专业声级计/分贝检测工具同时测试时，无声环境外部显示约 35 分贝，播放声音时外部最高达 70 多分贝，但小程序 AI 鼾声录音平均分贝仅计算出 30 分贝，峰值仅计算出 38 分贝。
- **状态**：实现完成，待回归。

## 2. 根因分析
- **原始公式**：
  ```javascript
  function calculateFrameDecibel(rms) {
    const normalized = clampNumber(rms / 32768, 0, 1);
    return Math.round(clampNumber(30 + Math.log10(1 + normalized * 9) * 50, 30, 95));
  }
  ```
- **数学失真机制**：
  1. 手机麦克风录到的 PCM 幅度为线性声压。播放 70 dB 声音时，手机录音 RMS 约为 1600（$\text{normalized} \approx 0.05$）。
  2. 原公式计算 $1 + 9 \times 0.05 = 1.45$，$\log_{10}(1.45) \approx 0.161$，代入后 $30 + 50 \times 0.161 = 38\text{ dB}$，精确将真实 70 dB 声学信号硬压缩成 38 dB。
  3. 安静环境底噪（RMS ~ 30, $\text{normalized} \approx 0.001$）代入后输出 30 dB。
  4. 35 dB（环境底噪）到 70 dB（播放声）的 35 dB 真实声学动态范围被压缩在仅 8 dB（30~38 dB）狭窄区间内。
  5. 下游鼾声识别门限 $\text{snoreThreshold} = \text{clamp}(\text{noiseFloor} + 8, 42, 62)$ 最低下限为 42 dB，峰值 38 dB 永远无法逾越该门限，导致所有鼾声帧和呼吸暂停均被误判为 0。

## 3. 修复方案实施
- **修改文件**：[`mp-weixin-rewrite/pages/assessment/recording/index.js`](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin-rewrite/pages/assessment/recording/index.js)
- **校准公式**：
  采用声学标准对数映射，以手机全幅数字削波（0 dBFS）对应约 96 dB SPL 的物理灵敏度进行偏置校准：
  $$\text{dB SPL} = \text{clamp}\left(20 \log_{10}\left(\frac{\max(\text{RMS}, 1)}{32768}\right) + 96, 30, 95\right)$$
- **预期响应**：
  - 静音/环境底噪（RMS ~ 30）输出 35 dB；
  - 轻度呼吸（RMS ~ 150）输出 49 dB；
  - 正常说话（RMS ~ 600）输出 61 dB；
  - 播放声音/较大声（RMS ~ 1600）输出 70 dB；
  - 大声打鼾（RMS ~ 5000）输出 80 dB；
  - 破音极限输出 95 dB。

## 4. 验证记录
| 测试套件 | 测试内容 | 预期结果 | 实际结果 |
| :--- | :--- | :--- | :--- |
| `snore-decibel-calibration.cjs` | 验证静音底噪(35dB)、70dB播放声、49dB轻声、80dB高声、0/极限输入截断及连续PCM流分析 | 各档位分贝精确对齐声学仪器，70dB录音峰值达到70dB，平均分贝46dB，打鼾率正确识别(40%) | 7/7 项全量通过 |
| `snore-functional.cjs` | 录音时序、异常状态、短音频拒绝、离线解析等 17 项既有用例 | 无回归破坏 | 17/17 项全量通过 |
| `snore-result-functional.cjs` | 评分一致性、呼吸暂停展示、有效性校验等 17 项报告用例 | 无回归破坏 | 17/17 项全量通过 |
| `snore-flow.cjs` | 在线录音解析、报告同步、预约联动等 12 项流程用例 | 无回归破坏 | 12/12 项全量通过 |

## 5. 待回归提示
- 需在微信开发者工具或真机录音场景下进行多音量实际播放声回归验收；
- 状态：**待回归**。
