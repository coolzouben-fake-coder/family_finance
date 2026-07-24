# 微信小程序体验版自动部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 默认分支每次 push 后，先测试并部署发生变化的云函数，再自动上传可追溯的微信小程序体验版。

**Architecture:** 使用一个顺序执行的 GitHub Actions job 保证后端部署成功后才上传前端。纯 Node.js 脚本负责变更检测和体验版上传，GitHub Actions 只负责注入事件数据、凭证和调用命令。

**Tech Stack:** Node.js 20、Jest 29、miniprogram-ci、CloudBase CLI v3、GitHub Actions

## Global Constraints

- 默认分支固定为 `feature/family-finance-projects`。
- AppID 固定为 `wxcabf6afa48b9277d`。
- CloudBase 环境固定为 `cloudbase-d7gx0ikiwa58549a4`。
- 只自动部署新增或修改的云函数；不自动删除线上云函数。
- 自动部署必须由默认分支 push 触发，同时支持 `workflow_dispatch` 手动重传体验版。
- Secrets 仅通过环境变量使用，不进入仓库、日志或构建产物。

---

## File Structure

- `scripts/detect-changed-functions.js`：把 Git diff 转换为去重后的云函数名称和删除警告。
- `scripts/upload-preview.js`：校验环境、创建 `miniprogram-ci` Project 并上传体验版。
- `scripts/__tests__/detect-changed-functions.test.js`：覆盖新增、修改、重复、删除和非云函数文件。
- `scripts/__tests__/upload-preview.test.js`：通过 mock 验证上传参数、版本号、备注和必需环境变量。
- `.github/workflows/deploy-preview.yml`：串联测试、变更检测、CloudBase 部署和体验版上传。
- `package.json`、`package-lock.json`：锁定 CI 依赖并增加脚本入口。

---

### Task 1: 云函数变更检测

**Files:**
- Create: `scripts/detect-changed-functions.js`
- Create: `scripts/__tests__/detect-changed-functions.test.js`

**Interfaces:**
- Consumes: `string[]` 形式的 `git diff --name-status` 行。
- Produces: `detectChangedFunctions(lines) -> { changed: string[], deleted: string[] }`；CLI 将 `changed` 与 `deleted` 写入 `$GITHUB_OUTPUT`。

- [ ] **Step 1: 写失败测试**

测试必须断言：`cloudfunctions/assets/index.js` 和同目录 `package.json` 只产生一次 `assets`；`D\tcloudfunctions/stats/index.js` 进入 `deleted`；`miniprogram/app.js` 被忽略；结果按名称排序。

```js
const { detectChangedFunctions } = require('../detect-changed-functions')

test('returns unique changed functions and deleted warnings', () => {
  expect(detectChangedFunctions([
    'M\tcloudfunctions/assets/index.js',
    'M\tcloudfunctions/assets/package.json',
    'A\tcloudfunctions/projects/index.js',
    'D\tcloudfunctions/stats/index.js',
    'M\tminiprogram/app.js'
  ])).toEqual({
    changed: ['assets', 'projects'],
    deleted: ['stats']
  })
})
```

- [ ] **Step 2: 验证测试失败**

Run: `npx jest scripts/__tests__/detect-changed-functions.test.js --runInBand`
Expected: FAIL，提示无法找到 `../detect-changed-functions`。

- [ ] **Step 3: 实现最小解析器与 CLI**

解析制表符分隔的 Git name-status；仅接受 `cloudfunctions/<name>/...`；状态以 `D` 开头时仅记录删除，否则记录变更；导出纯函数。CLI 接收 `--before`、`--after`，调用 `git diff --name-status`，并向 `$GITHUB_OUTPUT` 写入 JSON 数组。

```js
function detectChangedFunctions(lines) {
  const changed = new Set()
  const deleted = new Set()
  for (const line of lines) {
    const [status, ...paths] = line.trim().split('\t')
    for (const file of paths) {
      const match = file.match(/^cloudfunctions\/([^/]+)\//)
      if (!match) continue
      if (status.startsWith('D')) deleted.add(match[1])
      else changed.add(match[1])
    }
  }
  for (const name of deleted) changed.delete(name)
  return { changed: [...changed].sort(), deleted: [...deleted].sort() }
}
```

CLI 对全零 before SHA 或手动触发返回空数组，不猜测基线。

- [ ] **Step 4: 验证测试通过**

Run: `npx jest scripts/__tests__/detect-changed-functions.test.js --runInBand`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/detect-changed-functions.js scripts/__tests__/detect-changed-functions.test.js
git commit -m "ci: detect changed cloud functions"
```

---

### Task 2: 体验版上传器

**Files:**
- Create: `scripts/upload-preview.js`
- Create: `scripts/__tests__/upload-preview.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `WECHAT_PRIVATE_KEY_PATH`、`GITHUB_RUN_NUMBER`、`GITHUB_SHA`、`COMMIT_MESSAGE`。
- Produces: `buildUploadMetadata(env, now) -> { version, desc }` 和 `uploadPreview(options) -> Promise<void>`。

- [ ] **Step 1: 写失败测试**

Mock `miniprogram-ci`，断言 Project 使用仓库根目录、AppID 和私钥路径；版本格式为 `YYYY.MM.DD.<run>`；描述包含 7 位 SHA 且长度不超过 45；缺失私钥路径时抛出明确错误。

```js
const { buildUploadMetadata, requiredEnv } = require('../upload-preview')

test('builds traceable upload metadata', () => {
  const metadata = buildUploadMetadata({
    GITHUB_RUN_NUMBER: '42',
    GITHUB_SHA: '1234567890abcdef',
    COMMIT_MESSAGE: 'feat: add budget'
  }, new Date('2026-07-24T10:00:00Z'))
  expect(metadata.version).toBe('2026.07.24.42')
  expect(metadata.desc).toContain('1234567')
  expect(metadata.desc.length).toBeLessThanOrEqual(45)
})

test('requires private key path', () => {
  expect(() => requiredEnv({}, 'WECHAT_PRIVATE_KEY_PATH')).toThrow('WECHAT_PRIVATE_KEY_PATH')
})
```

- [ ] **Step 2: 验证测试失败**

Run: `npx jest scripts/__tests__/upload-preview.test.js --runInBand`
Expected: FAIL，提示无法找到 `../upload-preview`。

- [ ] **Step 3: 安装并锁定依赖**

Run: `npm install --save-dev miniprogram-ci@2.1.31 @cloudbase/cli@3`
Expected: `package.json` 和 `package-lock.json` 更新，`npm ls miniprogram-ci @cloudbase/cli` 成功。

- [ ] **Step 4: 实现上传器**

使用 `new ci.Project({ appid: 'wxcabf6afa48b9277d', type: 'miniProgram', projectPath: path.resolve(__dirname, '..'), privateKeyPath, ignores: ['node_modules/**/*', 'cloudfunctions/**/*', 'docs/**/*'] })`，再调用：

```js
await ci.upload({
  project,
  version,
  desc,
  setting: { es6: true, minify: true, codeProtect: false },
  onProgressUpdate: console.log
})
```

脚本直接运行时执行上传；被测试引用时只导出函数。不得打印私钥内容。

- [ ] **Step 5: 验证上传器测试与全量测试**

Run: `npx jest scripts/__tests__/upload-preview.test.js --runInBand && npm test -- --runInBand`
Expected: 两条命令均 PASS。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json scripts/upload-preview.js scripts/__tests__/upload-preview.test.js
git commit -m "ci: add WeChat preview uploader"
```

---

### Task 3: GitHub Actions 部署流水线

**Files:**
- Create: `.github/workflows/deploy-preview.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: Repository Secrets `WECHAT_PRIVATE_KEY`、`TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`。
- Produces: 默认分支 push 后的测试、变更云函数部署、体验版上传和 GitHub Step Summary。

- [ ] **Step 1: 增加 package scripts**

在 `package.json` 中增加：

```json
{
  "scripts": {
    "ci:detect-functions": "node scripts/detect-changed-functions.js",
    "ci:upload-preview": "node scripts/upload-preview.js"
  }
}
```

保留现有 `test` 和 `test:unit`。

- [ ] **Step 2: 创建工作流触发与权限**

```yaml
name: Deploy WeChat Preview
on:
  push:
    branches: [feature/family-finance-projects]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: wechat-preview-${{ github.ref }}
  cancel-in-progress: false
```

使用 `ubuntu-latest`、`actions/checkout@v4` 的 `fetch-depth: 0`、`actions/setup-node@v4` 的 Node 20 和 npm cache。

- [ ] **Step 3: 增加验证、测试和变更检测步骤**

工作流先检查三个 Secret 是否非空，但不输出值；执行 `npm ci` 和 `npm test -- --runInBand`；push 事件把 `${{ github.event.before }}` 与 `${{ github.sha }}` 传给检测脚本，手动触发传空基线并跳过云函数。

- [ ] **Step 4: 增加逐个云函数部署**

把 `TENCENT_SECRET_ID` 和 `TENCENT_SECRET_KEY` 映射到 CloudBase CLI 支持的凭证环境变量。先运行 `npx tcb --version` 与 `npx tcb fn deploy --help` 验证实际 CLI，再对 JSON 数组逐项执行：

```bash
npx tcb fn deploy "$function_name" \
  --env-id cloudbase-d7gx0ikiwa58549a4 \
  --yes \
  --json
```

不使用 `--force`，避免无意覆盖触发器和函数配置；CLI 返回非零立即终止。

- [ ] **Step 5: 增加私钥临时文件与体验版上传**

用 `umask 077` 将 `${{ secrets.WECHAT_PRIVATE_KEY }}` 写入 `$RUNNER_TEMP/wechat-upload.key`，通过 `WECHAT_PRIVATE_KEY_PATH` 传给 `npm run ci:upload-preview`。增加 `if: always()` 清理步骤删除该精确临时文件。

- [ ] **Step 6: 增加部署摘要**

向 `$GITHUB_STEP_SUMMARY` 写入 commit SHA、版本号、部署的函数列表、删除警告和体验版上传结果；不得写入任何 Secret。

- [ ] **Step 7: 静态验证工作流并运行全量测试**

Run: `npx yaml-lint .github/workflows/deploy-preview.yml`（若项目未安装 yaml-lint，则用 Ruby `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/deploy-preview.yml'); puts 'valid'"`）
Expected: 输出 `valid` 或 lint 成功。

Run: `npm ci && npm test -- --runInBand`
Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add package.json package-lock.json .github/workflows/deploy-preview.yml
git commit -m "ci: deploy changed functions and WeChat preview"
```

---

### Task 4: 端到端验证与交付

**Files:**
- Verify: `.github/workflows/deploy-preview.yml`
- Verify: GitHub Actions run logs
- Verify: 微信公众平台体验版列表

**Interfaces:**
- Consumes: 已配置的三个 Repository Secrets 和默认分支最新提交。
- Produces: 一次成功的真实自动部署记录。

- [ ] **Step 1: 推送实现提交到默认分支**

Run: `git push origin feature/family-finance-projects`
Expected: GitHub 创建 `Deploy WeChat Preview` workflow run。

- [ ] **Step 2: 检查 Actions 状态**

确认测试成功；本次若没有云函数业务变更则显示跳过；体验版上传成功；清理步骤无论前序结果如何都执行。

- [ ] **Step 3: 检查微信体验版**

在微信公众平台或开发者工具中确认最新体验版版本号符合 `YYYY.MM.DD.<run>`，备注包含触发提交短 SHA。

- [ ] **Step 4: 验证变更云函数路径**

后续对一个云函数做真实业务修改时，确认摘要只列出该函数。不得为验证流水线而制造无意义的云函数变更。

- [ ] **Step 5: 最终验证与提交状态**

Run: `npm ci && npm test -- --runInBand && git status --short`
Expected: 测试 PASS；工作树为空。
