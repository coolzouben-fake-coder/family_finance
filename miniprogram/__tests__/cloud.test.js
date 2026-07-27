describe('cloud service', () => {
  beforeEach(() => {
    jest.resetModules();
    global.wx = {
      cloud: {
        callFunction: jest.fn()
      }
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    delete global.wx;
  });

  test('keeps optional asset change failures quiet', async () => {
    const error = new Error('list changes failed');
    global.wx.cloud.callFunction.mockRejectedValue(error);
    const { listAssetChanges } = require('../services/cloud');

    await expect(listAssetChanges()).rejects.toThrow('list changes failed');

    expect(global.wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'assets',
      data: { action: 'listChanges' }
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  test('logs required cloud failures', async () => {
    const error = new Error('asset get failed');
    global.wx.cloud.callFunction.mockRejectedValue(error);
    const { getAssets } = require('../services/cloud');

    await expect(getAssets()).rejects.toThrow('asset get failed');

    expect(console.error).toHaveBeenCalledWith('[cloud function failed]', expect.objectContaining({
      name: 'assets',
      action: 'get',
      error
    }));
  });

  test('turns app-level cloud failures into rejected errors', async () => {
    global.wx.cloud.callFunction.mockResolvedValue({
      result: { ok: false, errorCode: 'ADMIN_DENIED', errorMessage: 'ADMIN_DENIED' }
    });
    const { checkAdmin } = require('../services/cloud');

    await expect(checkAdmin()).rejects.toMatchObject({
      message: 'ADMIN_DENIED',
      errCode: 'ADMIN_DENIED',
      errMsg: 'ADMIN_DENIED'
    });

    expect(console.error).toHaveBeenCalledWith('[cloud function failed]', expect.objectContaining({
      name: 'admin',
      action: 'check',
      errCode: 'ADMIN_DENIED',
      errMsg: 'ADMIN_DENIED'
    }));
  });

  test('sends exact admin API payloads', async () => {
    global.wx.cloud.callFunction.mockImplementation(({ data }) => Promise.resolve({ result: { ok: true, data } }));
    const {
      checkAdmin,
      listAdminCollections,
      queryAdminDocuments,
      getAdminDocument,
      createAdminDocument,
      updateAdminDocument,
      setAdminDocument,
      removeAdminDocument
    } = require('../services/cloud');

    await checkAdmin();
    await listAdminCollections();
    await queryAdminDocuments('projects', { keyword: '华泰', limit: 20, offset: 0 });
    await getAdminDocument('projects', 'project-1');
    await createAdminDocument('projects', { name: 'new' });
    await updateAdminDocument('projects', 'project-1', { name: 'updated' });
    await setAdminDocument('projects', 'project-1', { name: 'replacement' });
    await removeAdminDocument('projects', 'project-1');

    expect(global.wx.cloud.callFunction.mock.calls.map(([request]) => request)).toEqual([
      { name: 'admin', data: { action: 'check' } },
      { name: 'admin', data: { action: 'listCollections' } },
      {
        name: 'admin',
        data: { action: 'query', collection: 'projects', keyword: '华泰', limit: 20, offset: 0 }
      },
      { name: 'admin', data: { action: 'get', collection: 'projects', id: 'project-1' } },
      { name: 'admin', data: { action: 'create', collection: 'projects', data: { name: 'new' } } },
      {
        name: 'admin',
        data: { action: 'update', collection: 'projects', id: 'project-1', data: { name: 'updated' } }
      },
      {
        name: 'admin',
        data: { action: 'set', collection: 'projects', id: 'project-1', data: { name: 'replacement' } }
      },
      { name: 'admin', data: { action: 'remove', collection: 'projects', id: 'project-1' } }
    ]);
  });

  test('query helper ignores hostile action, collection, and id options', async () => {
    global.wx.cloud.callFunction.mockResolvedValue({ result: { ok: true } });
    const { queryAdminDocuments } = require('../services/cloud');

    await queryAdminDocuments('projects', {
      action: 'remove',
      collection: 'users',
      id: 'user-1',
      keyword: '华泰',
      limit: 20,
      offset: 0
    });

    expect(global.wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'admin',
      data: {
        action: 'query',
        collection: 'projects',
        keyword: '华泰',
        limit: 20,
        offset: 0
      }
    });
  });
});
