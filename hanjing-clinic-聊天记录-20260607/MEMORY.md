# 长期记忆

## 项目约定

### 鼾静健康诊所小程序（hanjing-clinic）
- 项目路径：`c:/Users/Administrator/WorkBuddy/20260604114437/hanjing-clinic/`
- 技术栈：uni-app + Vue3 + TypeScript（小程序端），Vue3 + TDesign（管理后台）
- AppID：wx0155dae3603ed54b
- npm 环境：Node v24.16.0 在 D:\，`D:\npx.cmd` 执行 uni build
- 编译命令：`$env:Path = "D:\;" + $env:Path; cd <project>; D:\npx.cmd uni build -p mp-weixin`
- 编译产物：`dist/build/mp-weixin`

### Emoji 兼容性规则
- **微信小程序 `<text>` 标签内禁止使用复杂 emoji**（如 🌙⏹⏳💡🤖🔄✅），会显示为蓝色方块
- 替代方案：纯文字（Zzz、■、...、OK、MIC）或 CSS 绘制图标
