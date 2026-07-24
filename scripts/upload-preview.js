const path = require('path')
const ci = require('miniprogram-ci')

const APP_ID = 'wxcabf6afa48b9277d'
const MAX_DESCRIPTION_LENGTH = 45

function requiredEnv(env, name) {
  const value = env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function buildUploadMetadata(env, now) {
  const date = now || new Date()
  const runNumber = requiredEnv(env, 'GITHUB_RUN_NUMBER')
  const sha = requiredEnv(env, 'GITHUB_SHA').slice(0, 7)
  const commitMessage = (env.COMMIT_MESSAGE || '').trim()
  const version = [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0'), runNumber].join('.')
  const desc = `${sha} ${commitMessage}`.trim().slice(0, MAX_DESCRIPTION_LENGTH)

  return { version, desc }
}

async function uploadPreview(options = {}) {
  const env = options.env || process.env
  const privateKeyPath = requiredEnv(env, 'WECHAT_PRIVATE_KEY_PATH')
  const version = requiredEnv(env, 'PREVIEW_VERSION')
  const desc = requiredEnv(env, 'PREVIEW_DESC')
  const project = new ci.Project({
    appid: APP_ID,
    type: 'miniProgram',
    projectPath: path.resolve(__dirname, '..'),
    privateKeyPath,
    ignores: ['node_modules/**/*', 'cloudfunctions/**/*', 'docs/**/*']
  })

  await ci.upload({
    project,
    version,
    desc,
    setting: { es6: true, minify: true, codeProtect: false },
    onProgressUpdate: console.log
  })
}

if (require.main === module) {
  uploadPreview().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { buildUploadMetadata, requiredEnv, uploadPreview }
