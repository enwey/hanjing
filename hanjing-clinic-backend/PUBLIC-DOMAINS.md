# 公网域名配置

正式API和自有上传资源统一使用 `https://m.xingkangming.com`。官网保留自己的域名，各Web端通过本站 `/api` 反向代理访问后端。

## 正式后端

在部署环境设置：

```dotenv
NODE_ENV=production
PUBLIC_BASE_URL=https://m.xingkangming.com
```

不要在PUBLIC_BASE_URL末尾添加业务路径。删除旧API_PUBLIC_BASE_URL配置；兼容期仍识别该变量，但两个配置冲突会阻止启动。旧m.hanjinghealth.com配置自动转换为新域名，并输出迁移日志。正式环境未配置时使用上面的正式域名；指定其他域名或本地地址将拒绝启动。

`public-urls.js` 是管理端上传链接和小程序码链接的统一生成入口。服务端JSON响应和小程序响应处理兼容已知新旧域名下的 `/uploads/`、`/static/` 和品牌头像地址，保留路径、查询签名和第三方URL。不批量修改数据库，不修改富文本中的嵌入链接。

新域名必须代理 `/api/`、`/uploads/` 及实际使用的静态资源路径到对应服务。迁移域名不会自动搬迁文件：旧文件必须仍在新域名对应的存储中。Web管理端和推广员端生产构建统一使用同源 `/api`，各自站点必须配置该代理；本地构建仍允许VITE_API_BASE_URL覆盖。

## 本地与小程序

后端开发环境PUBLIC_BASE_URL留空时按请求地址生成资源URL。小程序开发者工具允许手动选择 `http://127.0.0.1:5005/api/v1`；真机预览、体验版和正式版默认使用正式API，不根据微信develop/trial/release推测后端环境。

## 上线核对

1. 更新后端代码与上述环境配置，重启并检查启动日志。
2. 确认新域名的 `/uploads/distribution/qrcodes/...` 返回图片而不是404或HTML。
3. 在微信公众平台核对request、downloadFile、uploadFile合法域名，按实际功能添加 `https://m.xingkangming.com`；socket功能另核对对应wss合法域名。
4. 上传并验证更新后的小程序，邀请页“后台图片地址”应为新域名；诊断应显示下载/图片校验/页面显示成功。
5. 支付回调属于外部平台集成配置，应使用新域名的既有回调路径；配置示例已更新。既有真实支付配置不得在缺少回调可达性验证时盲目替换。

以上微信平台、DNS、TLS证书、反向代理及生产环境变量需要在实际部署环境完成，代码修改不会自动修改这些服务。
