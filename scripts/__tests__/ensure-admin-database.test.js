const {
  ensureAdminDatabase,
  runCli
} = require('../ensure-admin-database');

const validEnv = {
  TENCENTCLOUD_SECRETID: 'secret-id',
  TENCENTCLOUD_SECRETKEY: 'secret-key',
  CLOUDBASE_ENV_ID: 'test-env'
};

function managerFixture() {
  return {
    env: {
      describeEnvInfo: jest.fn().mockResolvedValue({
        EnvInfo: { EnvBaseInfo: { Meta: [] } }
      })
    },
    database: {
      createCollectionIfNotExists: jest.fn().mockResolvedValue({ exists: true })
    },
    permission: {
      modifyResourcePermission: jest.fn().mockResolvedValue({
        Data: { Success: true },
        RequestId: 'request-1'
      }),
      describeResourcePermission: jest.fn().mockResolvedValue({
        Data: {
          TotalCount: 1,
          PermissionList: [{
            Resource: 'admin_audit_logs',
            Permission: 'CUSTOM',
            SecurityRule: JSON.stringify({ read: false, write: false })
          }]
        },
        RequestId: 'request-2'
      })
    }
  };
}

test.each([
  'TENCENTCLOUD_SECRETID',
  'TENCENTCLOUD_SECRETKEY',
  'CLOUDBASE_ENV_ID'
])('requires %s', async (name) => {
  const env = { ...validEnv };
  delete env[name];
  await expect(ensureAdminDatabase({ env, CloudBase: { init: jest.fn() } }))
    .rejects.toThrow(`${name} is required`);
});

test('idempotently creates the audit collection and applies client deny-all', async () => {
  const manager = managerFixture();
  const CloudBase = { init: jest.fn(() => manager) };

  await ensureAdminDatabase({ env: validEnv, CloudBase });

  expect(CloudBase.init).toHaveBeenCalledWith({
    secretId: 'secret-id',
    secretKey: 'secret-key',
    envId: 'test-env'
  });
  expect(manager.env.describeEnvInfo).toHaveBeenCalledWith({ EnvId: 'test-env' });
  expect(manager.database.createCollectionIfNotExists)
    .toHaveBeenCalledWith('admin_audit_logs');
  expect(manager.permission.modifyResourcePermission).toHaveBeenCalledWith({
    resourceType: 'collection',
    resource: 'admin_audit_logs',
    permission: 'CUSTOM',
    securityRule: JSON.stringify({ read: false, write: false })
  });
  expect(manager.permission.describeResourcePermission).toHaveBeenCalledWith({
    resourceType: 'collection',
    resources: ['admin_audit_logs']
  });
  expect(manager.env.describeEnvInfo.mock.invocationCallOrder[0])
    .toBeLessThan(manager.database.createCollectionIfNotExists.mock.invocationCallOrder[0]);
});

test('treats missing Meta as a legacy environment like manager 5.6.4', async () => {
  const manager = managerFixture();
  manager.env.describeEnvInfo.mockResolvedValue({ EnvInfo: { EnvBaseInfo: {} } });

  await expect(ensureAdminDatabase({
    env: validEnv,
    CloudBase: { init: () => manager }
  })).resolves.toBeUndefined();
});

test('refuses to modify collection permissions for an OPA environment', async () => {
  const manager = managerFixture();
  manager.env.describeEnvInfo.mockResolvedValue({
    EnvInfo: {
      EnvBaseInfo: {
        Meta: [{ Key: 'authz_engine', Value: 'opa' }]
      }
    }
  });

  await expect(ensureAdminDatabase({
    env: validEnv,
    CloudBase: { init: () => manager }
  })).rejects.toThrow('OPA authorization engine');
  expect(manager.database.createCollectionIfNotExists).not.toHaveBeenCalled();
  expect(manager.permission.modifyResourcePermission).not.toHaveBeenCalled();
});

test.each([
  ['missing EnvInfo', {}],
  ['missing EnvBaseInfo', { EnvInfo: {} }],
  ['invalid Meta', { EnvInfo: { EnvBaseInfo: { Meta: {} } } }],
  ['invalid Meta entry', {
    EnvInfo: { EnvBaseInfo: { Meta: [{ Key: 'authz_engine' }] } }
  }]
])('fails closed for %s', async (_name, response) => {
  const manager = managerFixture();
  manager.env.describeEnvInfo.mockResolvedValue(response);

  await expect(ensureAdminDatabase({
    env: validEnv,
    CloudBase: { init: () => manager }
  })).rejects.toThrow();
  expect(manager.database.createCollectionIfNotExists).not.toHaveBeenCalled();
});

test('fails when permission modification does not explicitly succeed', async () => {
  const manager = managerFixture();
  manager.permission.modifyResourcePermission.mockResolvedValue({
    Data: { Success: false }
  });

  await expect(ensureAdminDatabase({
    env: validEnv,
    CloudBase: { init: () => manager }
  })).rejects.toThrow('permission modification failed');
  expect(manager.permission.describeResourcePermission).not.toHaveBeenCalled();
});

test.each([
  ['invalid API response', {}],
  ['missing audit permission', {
    Data: { TotalCount: 0, PermissionList: [] }
  }],
  ['permission mismatch', {
    Data: {
      TotalCount: 1,
      PermissionList: [{
        Resource: 'admin_audit_logs',
        Permission: 'READONLY',
        SecurityRule: JSON.stringify({ read: false, write: false })
      }]
    }
  }],
  ['malformed security rule', {
    Data: {
      TotalCount: 1,
      PermissionList: [{
        Resource: 'admin_audit_logs',
        Permission: 'CUSTOM',
        SecurityRule: '{invalid'
      }]
    }
  }],
  ['security rule mismatch', {
    Data: {
      TotalCount: 1,
      PermissionList: [{
        Resource: 'admin_audit_logs',
        Permission: 'CUSTOM',
        SecurityRule: JSON.stringify({ read: true, write: false })
      }]
    }
  }]
])('fails closed for readback: %s', async (_name, response) => {
  const manager = managerFixture();
  manager.permission.describeResourcePermission.mockResolvedValue(response);

  await expect(ensureAdminDatabase({
    env: validEnv,
    CloudBase: { init: () => manager }
  })).rejects.toThrow('permission verification failed');
});

test('propagates manager failures', async () => {
  const manager = managerFixture();
  manager.database.createCollectionIfNotExists.mockRejectedValue(new Error('create failed'));

  await expect(ensureAdminDatabase({
    env: validEnv,
    CloudBase: { init: () => manager }
  })).rejects.toThrow('create failed');
  expect(manager.permission.modifyResourcePermission).not.toHaveBeenCalled();
});

test('sets a failing process exit code when CLI setup fails', async () => {
  const processObject = { exitCode: 0 };
  const logger = { error: jest.fn() };

  await runCli({
    ensure: jest.fn().mockRejectedValue(new Error('permission failed')),
    processObject,
    logger
  });

  expect(processObject.exitCode).toBe(1);
  expect(logger.error).toHaveBeenCalledWith('permission failed');
});
