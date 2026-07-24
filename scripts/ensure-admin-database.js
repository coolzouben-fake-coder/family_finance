function requiredEnv(env, name) {
  const value = env[name]
  if (!value || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function environmentMeta(response) {
  if (
    !response
    || typeof response !== 'object'
    || !response.EnvInfo
    || typeof response.EnvInfo !== 'object'
    || !response.EnvInfo.EnvBaseInfo
    || typeof response.EnvInfo.EnvBaseInfo !== 'object'
  ) throw new Error('environment inspection failed: invalid DescribeEnvInfo response')

  const { Meta } = response.EnvInfo.EnvBaseInfo
  if (Meta === undefined || Meta === null) return []
  if (
    !Array.isArray(Meta)
    || Meta.some((item) => (
      !item
      || typeof item !== 'object'
      || typeof item.Key !== 'string'
      || typeof item.Value !== 'string'
    ))
  ) throw new Error('environment inspection failed: invalid Meta')
  return Meta
}

function verifyDenyAllPermission(response) {
  const permissions = response
    && response.Data
    && response.Data.PermissionList
  if (!Array.isArray(permissions)) {
    throw new Error('permission verification failed: invalid API response')
  }
  const auditPermission = permissions.find(({ Resource }) => (
    Resource === 'admin_audit_logs'
  ))
  if (!auditPermission || auditPermission.Permission !== 'CUSTOM') {
    throw new Error('permission verification failed: CUSTOM permission missing')
  }

  let securityRule
  try {
    securityRule = JSON.parse(auditPermission.SecurityRule)
  } catch (_error) {
    throw new Error('permission verification failed: malformed security rule')
  }
  if (
    !securityRule
    || typeof securityRule !== 'object'
    || Array.isArray(securityRule)
    || Object.keys(securityRule).sort().join(',') !== 'read,write'
    || securityRule.read !== false
    || securityRule.write !== false
  ) throw new Error('permission verification failed: deny-all rule mismatch')
}

async function ensureAdminDatabase(options = {}) {
  const env = options.env || process.env
  const CloudBase = options.CloudBase || require('@cloudbase/manager-node')
  const envId = requiredEnv(env, 'CLOUDBASE_ENV_ID')
  const app = CloudBase.init({
    secretId: requiredEnv(env, 'TENCENTCLOUD_SECRETID'),
    secretKey: requiredEnv(env, 'TENCENTCLOUD_SECRETKEY'),
    envId
  })

  const meta = environmentMeta(await app.env.describeEnvInfo({ EnvId: envId }))
  if (meta.some(({ Key, Value }) => Key === 'authz_engine' && Value === 'opa')) {
    throw new Error(
      'OPA authorization engine detected; refusing to overwrite environment Rego policies'
    )
  }

  await app.database.createCollectionIfNotExists('admin_audit_logs')
  const modification = await app.permission.modifyResourcePermission({
    resourceType: 'collection',
    resource: 'admin_audit_logs',
    permission: 'CUSTOM',
    securityRule: JSON.stringify({ read: false, write: false })
  })
  if (!modification || !modification.Data || modification.Data.Success !== true) {
    throw new Error('permission modification failed: API did not return Success=true')
  }

  const readback = await app.permission.describeResourcePermission({
    resourceType: 'collection',
    resources: ['admin_audit_logs']
  })
  verifyDenyAllPermission(readback)
}

async function runCli(options = {}) {
  const ensure = options.ensure || ensureAdminDatabase
  const processObject = options.processObject || process
  const logger = options.logger || console
  try {
    await ensure({
      env: options.env || process.env,
      CloudBase: options.CloudBase
    })
  } catch (error) {
    logger.error(error.message)
    processObject.exitCode = 1
  }
}

if (require.main === module) runCli()

module.exports = {
  ensureAdminDatabase,
  environmentMeta,
  requiredEnv,
  runCli,
  verifyDenyAllPermission
}
