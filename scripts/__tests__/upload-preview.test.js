const mockProject = { kind: 'project' }
const mockProjectConstructor = jest.fn(() => mockProject)
const mockUpload = jest.fn(() => Promise.resolve())
const path = require('path')

jest.mock('miniprogram-ci', () => ({ Project: mockProjectConstructor, upload: mockUpload }), { virtual: true })

const { buildUploadMetadata, requiredEnv, uploadPreview } = require('../upload-preview')

beforeEach(() => {
  mockProjectConstructor.mockClear()
  mockUpload.mockClear()
})

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

test('uploads the repository mini program with traceable metadata', async () => {
  await uploadPreview({
    env: {
      WECHAT_PRIVATE_KEY_PATH: '/tmp/wechat-private.key',
      PREVIEW_VERSION: '2026.07.24.42',
      PREVIEW_DESC: '1234567 feat: prepared before midnight'
    }
  })

  expect(mockProjectConstructor).toHaveBeenCalledWith({
    appid: 'wxcabf6afa48b9277d',
    type: 'miniProgram',
    projectPath: path.resolve(__dirname, '..', '..'),
    privateKeyPath: '/tmp/wechat-private.key',
    ignores: ['node_modules/**/*', 'cloudfunctions/**/*', 'docs/**/*']
  })
  expect(mockUpload).toHaveBeenCalledWith({
    project: mockProject,
    version: '2026.07.24.42',
    desc: '1234567 feat: prepared before midnight',
    setting: { es6: true, minify: true, codeProtect: false },
    onProgressUpdate: console.log
  })
})

test('requires the prepared preview version and description for upload', async () => {
  await expect(uploadPreview({
    env: {
      WECHAT_PRIVATE_KEY_PATH: '/tmp/wechat-private.key',
      GITHUB_RUN_NUMBER: '42',
      GITHUB_SHA: '1234567890abcdef'
    }
  })).rejects.toThrow('PREVIEW_VERSION')
})
