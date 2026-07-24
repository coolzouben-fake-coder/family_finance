# 微信小程序体验版自动部署设计

## 目标

当代码直接推送或通过 Pull Request 合入默认分支 `feature/family-finance-projects` 后，自动执行测试、部署本次变更的云函数，并上传微信小程序体验版。

## 项目与环境

- GitHub 仓库：`coolzouben-fake-coder/family_finance`
- 小程序技术栈：微信原生小程序
- 小程序 AppID：`wxcabf6afa48b9277d`
- 小程序目录：`miniprogram/`
- 云函数目录：`cloudfunctions/`
- 云开发环境：`cloudbase-d7gx0ikiwa58549a4`
- 默认分支：`feature/family-finance-projects`

## 触发规则

GitHub Actions 监听默认分支的 `push` 事件。直接推送和 Pull Request 合并都会产生该事件，因此由同一个入口处理且不会重复触发。

工作流同时支持 `workflow_dispatch`，用于在 GitHub Actions 页面手动重跑部署。

## 流水线

流水线采用单一顺序流程，以避免小程序代码与云函数版本不一致：

1. 检出触发提交的完整代码和必要的 Git 历史。
2. 设置 Node.js 环境并安装锁定依赖。
3. 执行 Jest 测试；失败时立即终止，不部署任何内容。
4. 根据 push 事件的 before/after SHA，识别 `cloudfunctions/<function-name>/` 下发生新增或修改的云函数目录。
5. 将识别出的云函数逐个部署到 `cloudbase-d7gx0ikiwa58549a4`。
6. 所有云函数部署成功后，通过 `miniprogram-ci` 上传小程序体验版。
7. 输出部署摘要，包括提交、体验版版本号、已部署云函数和未部署原因。

## 云函数变更策略

- 新增或修改某个云函数目录中的任意文件时，部署该云函数。
- 同一云函数内多个文件变化只部署一次。
- 仅修改小程序代码时，不部署云函数。
- 删除云函数目录时不自动删除线上函数；工作流给出警告，防止误删生产资源。
- 手动触发时没有可靠的 before SHA，因此默认不部署云函数，只重新上传体验版；如需重部署云函数，应通过新的代码提交触发，或后续单独扩展显式函数选择参数。

## 体验版上传

- 使用 `miniprogram-ci` 读取 `project.config.json`。
- 上传版本号采用 `YYYY.MM.DD.<github_run_number>`，保证可读且便于追溯。
- 上传备注包含短 commit SHA 和提交标题，并截断到微信接口允许的范围。
- 微信上传私钥从 GitHub Secret `WECHAT_PRIVATE_KEY` 写入 Runner 临时文件。
- 无论成功或失败，任务结束时都清理临时私钥文件。

## 凭证与安全

GitHub Actions 使用以下 Repository Secrets：

- `WECHAT_PRIVATE_KEY`：微信小程序代码上传私钥完整内容。
- `TENCENT_SECRET_ID`：用于部署 CloudBase 云函数的腾讯云子账号 SecretId。
- `TENCENT_SECRET_KEY`：对应 SecretKey。

凭证不得写入仓库、日志或构建产物。CloudBase 凭证使用独立子账号并遵循最小权限原则。

## 失败处理

- 依赖安装或测试失败：终止，不部署云函数，不上传体验版。
- 任一变更云函数部署失败：终止，不上传体验版。
- 体验版上传失败：保留已成功部署的云函数，不自动回滚；Action 标记失败并显示错误。
- 未检测到云函数变化：正常跳过云函数步骤并继续上传体验版。
- Secret 缺失或格式错误：在真正部署前执行非明文校验并快速失败。

## 测试与验收

实施后至少验证以下场景：

1. 本地或 CI 中的 Jest 测试通过。
2. 工作流配置可被 GitHub Actions 正确解析。
3. 仅修改小程序文件时，跳过云函数并上传体验版。
4. 修改一个云函数时，只部署该函数，随后上传体验版。
5. 修改多个云函数时，每个函数只部署一次。
6. 测试失败时不执行任何部署。
7. 云函数部署失败时不上传体验版。
8. 微信公众平台能看到带有 commit 信息的最新体验版。

## 非目标

- 不自动提交审核或发布正式版。
- 不自动删除线上云函数。
- 不部署未发生变化的云函数。
- 不把任何凭证提交到 GitHub 仓库。

## 预览二维码扩展

小程序开发版本上传成功后，流水线调用 `miniprogram-ci.preview()` 生成 PNG
预览二维码。二维码保存到 Runner 临时目录，并通过
`actions/upload-artifact` 上传为 `wechat-preview-qrcode` Artifact。

- 二维码生成失败时流水线失败，不把没有二维码的运行报告为完整成功。
- Artifact 保留 7 天，不把上传私钥包含在 Artifact 中。
- 私钥清理步骤仍使用 `if: always()`，覆盖二维码生成或 Artifact 上传失败。
- 每次协作开发完成后，助手等待 Actions 运行结束，下载该 Artifact，并在聊天中返回 PNG。
- 二维码的扫码权限由微信小程序成员配置决定；不把它描述为公众平台“体验版”。
