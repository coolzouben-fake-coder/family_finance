const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-preview.yml'), 'utf8')
const checklist = fs.readFileSync(path.join(root, 'docs/qa/first-version-checklist.md'), 'utf8')
const packageJson = require(path.join(root, 'package.json'))

test('deploys validated changed functions sequentially with the pinned CloudBase CLI', () => {
  expect(packageJson.scripts['ci:deploy-functions']).toBeUndefined()
  expect(packageJson.devDependencies['@cloudbase/manager-node']).toBeUndefined()
  expect(packageJson.devDependencies['@cloudbase/cli']).toBeUndefined()
  expect(workflow).toContain(
    'npm install --no-save @cloudbase/cli@3.6.4 @cloudbase/manager-node@5.6.4 miniprogram-ci@2.1.31'
  )
  expect(workflow).toContain('CHANGED_FUNCTIONS must be a JSON array')
  expect(workflow).toContain('for function_name in "${changed_functions[@]}"; do')
  expect(workflow).toContain('npx tcb fn deploy "$function_name" --env-id cloudbase-d7gx0ikiwa58549a4 --yes')
  expect(workflow).not.toContain(' fn delete ')
  expect(workflow).not.toContain('--force')
})

test('prepares the admin audit collection before deploying changed functions', () => {
  const ensureIndex = workflow.indexOf('name: Ensure admin database resources')
  const deployIndex = workflow.indexOf('name: Deploy changed cloud functions')
  const ensureStep = workflow.slice(ensureIndex, deployIndex)

  expect(ensureIndex).toBeGreaterThan(-1)
  expect(deployIndex).toBeGreaterThan(ensureIndex)
  expect(ensureStep).toContain("contains(fromJSON(steps.functions.outputs.changed), 'admin')")
  expect(ensureStep).toContain('TENCENTCLOUD_SECRETID: ${{ secrets.TENCENT_SECRET_ID }}')
  expect(ensureStep).toContain('TENCENTCLOUD_SECRETKEY: ${{ secrets.TENCENT_SECRET_KEY }}')
  expect(ensureStep).toContain('CLOUDBASE_ENV_ID: cloudbase-d7gx0ikiwa58549a4')
  expect(ensureStep).toContain('run: node scripts/ensure-admin-database.js')
})

test('documents complete admin deployment and authorization acceptance checks', () => {
  [
    'admin_audit_logs',
    'admin 云函数',
    '管理员账号',
    '非管理员账号',
    'CRUD',
    '审计记录',
    '客户端直接访问',
    '拒绝'
  ].forEach((text) => expect(checklist).toContain(text))
})

test('passes prepared preview metadata unchanged into the uploader and summary', () => {
  expect(workflow).toContain('PREVIEW_VERSION: ${{ steps.preview.outputs.version }}')
  expect(workflow).toContain('PREVIEW_DESC: ${{ steps.preview.outputs.desc }}')
  expect(workflow).toContain("PREVIEW_VERSION: ${{ steps.preview.outputs.version || 'not uploaded' }}")
})

test('publishes the generated preview QR artifact after upload and before key cleanup', () => {
  const uploadIndex = workflow.indexOf('name: Upload WeChat preview')
  const generateQrIndex = workflow.indexOf('name: Generate WeChat preview QR')
  const uploadArtifactIndex = workflow.indexOf('name: Upload WeChat preview QR artifact')
  const cleanupIndex = workflow.indexOf('name: Clean up WeChat upload key')
  const generateQrStep = workflow.slice(generateQrIndex, uploadArtifactIndex)

  expect(generateQrIndex).toBeGreaterThan(uploadIndex)
  expect(uploadArtifactIndex).toBeGreaterThan(generateQrIndex)
  expect(cleanupIndex).toBeGreaterThan(uploadArtifactIndex)
  expect(generateQrStep).toContain(
    'WECHAT_PRIVATE_KEY_PATH: ${{ runner.temp }}/wechat-upload.key'
  )
  expect(generateQrStep).toContain('PREVIEW_DESC: ${{ steps.preview.outputs.desc }}')
  expect(workflow).toContain('PREVIEW_QR_PATH: ${{ runner.temp }}/wechat-preview-qrcode.png')
  expect(workflow).toContain('run: npm run ci:generate-preview-qr')
  expect(workflow).toContain('uses: actions/upload-artifact@v4')
  expect(workflow).toContain('name: wechat-preview-qrcode')
  expect(workflow).toContain('path: ${{ runner.temp }}/wechat-preview-qrcode.png')
  expect(workflow).toContain('if-no-files-found: error')
  expect(workflow).toContain('retention-days: 7')
  expect(workflow).toContain("QR_GENERATION_OUTCOME: ${{ steps.generate_qr.outcome || 'skipped' }}")
  expect(workflow).toContain("QR_ARTIFACT_UPLOAD_OUTCOME: ${{ steps.upload_qr.outcome || 'skipped' }}")
  expect(workflow).toContain('only when QR generation and artifact upload both succeeded')
})
