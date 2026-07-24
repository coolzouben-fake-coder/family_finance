# 微信小程序预览二维码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发版本上传后生成可扫码的预览二维码，并将 PNG 保存为 GitHub Actions Artifact 供聊天回传。

**Architecture:** 在现有 `upload-preview.js` 中新增独立的二维码生成函数和 CLI 入口。工作流在上传成功后生成 PNG，并用官方 Artifact Action 保存 7 天。

**Tech Stack:** Node.js 20、Jest 29、miniprogram-ci 2.1.31、GitHub Actions

## Global Constraints

- AppID 固定为 `wxcabf6afa48b9277d`。
- Artifact 名称固定为 `wechat-preview-qrcode`，保留 7 天。
- 二维码生成失败必须使流水线失败。
- Artifact 只能包含二维码 PNG，不能包含上传私钥。
- 私钥始终由 `if: always()` 步骤清理。

---

### Task 1: 二维码生成器

**Files:**
- Modify: `scripts/upload-preview.js`
- Modify: `scripts/__tests__/upload-preview.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WECHAT_PRIVATE_KEY_PATH`、`PREVIEW_DESC`、`PREVIEW_QR_PATH`。
- Produces: `generatePreviewQr(options) -> Promise<void>`，并在指定路径创建 PNG。

- [ ] 写失败测试，mock `ci.preview` 并断言 `qrcodeFormat: "image"`、`qrcodeOutputDest` 使用 `PREVIEW_QR_PATH`。
- [ ] 运行 `npx jest scripts/__tests__/upload-preview.test.js --runInBand`，确认新测试先失败。
- [ ] 实现 `generatePreviewQr` 和 `ci:generate-preview-qr` script；直接运行失败时返回非零。
- [ ] 运行 focused tests 和 `npm test -- --runInBand`，确认通过。
- [ ] 提交 `feat: generate WeChat preview QR code`。

### Task 2: 工作流 Artifact

**Files:**
- Modify: `.github/workflows/deploy-preview.yml`
- Modify: `scripts/__tests__/deploy-workflow.test.js`

**Interfaces:**
- Consumes: Task 1 的 `ci:generate-preview-qr`。
- Produces: `wechat-preview-qrcode` Artifact，内容为 `$RUNNER_TEMP/wechat-preview-qrcode.png`。

- [ ] 写失败测试，断言二维码步骤位于上传后、清理前，Artifact 只包含 PNG 且 `retention-days: 7`。
- [ ] 运行 focused test，确认失败。
- [ ] 增加生成二维码与 `actions/upload-artifact@v4` 步骤；二维码失败保持默认 fail-fast。
- [ ] 更新 Step Summary，明确区分开发版本上传和预览二维码。
- [ ] 运行 YAML 校验、focused tests 和全量测试。
- [ ] 提交 `ci: publish WeChat preview QR artifact`。

### Task 3: 真实运行验证

**Files:**
- Verify: GitHub Actions run
- Verify: `wechat-preview-qrcode` Artifact

**Interfaces:**
- Consumes: 已配置的微信上传私钥。
- Produces: 可下载并在聊天中展示的 PNG。

- [ ] 推送分支并创建 PR。
- [ ] 合入默认分支，等待 Actions 完成。
- [ ] 确认上传、二维码生成、Artifact、清理步骤成功。
- [ ] 下载 Artifact，确认 ZIP 只含一张非空 PNG。
- [ ] 在聊天中返回二维码图片。
