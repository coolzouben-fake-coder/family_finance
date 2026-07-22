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
});
