const mockEnsureAllowedSession = jest.fn();
const mockListAssetChanges = jest.fn();
const fs = require('fs');
const path = require('path');

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({ listAssetChanges: mockListAssetChanges }));

let pageDefinition;

function createPage() {
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) {
      this.data = { ...this.data, ...update };
    }
  };
  page.onLoad = pageDefinition.onLoad.bind(page);
  page.loadChanges = pageDefinition.loadChanges.bind(page);
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('asset change records page', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockEnsureAllowedSession.mockResolvedValue();
    mockListAssetChanges.mockResolvedValue({ changes: [
      { _id: 'change-2', type: 'withdraw', amount: 1000, beforeAmount: 51000, afterAmount: 50000, reason: '支取备用', createdAt: '2026-07-22T10:00:00Z' },
      { _id: 'legacy-change', beforeAmount: 50000, afterAmount: 51000, reason: '历史存入', createdAt: '2026-07-21T10:00:00Z' }
    ] });
    global.Page = (definition) => { pageDefinition = definition; };
    require('../pages/asset-changes/asset-changes');
  });

  afterEach(() => {
    delete global.Page;
  });

  test('loads and formats asset change records', async () => {
    const page = createPage();

    page.onLoad();
    await flushPromises();
    await flushPromises();

    expect(mockEnsureAllowedSession).toHaveBeenCalledTimes(1);
    expect(mockListAssetChanges).toHaveBeenCalledTimes(1);
    expect(page.data.loading).toBe(false);
    expect(page.data.changes).toEqual([
      expect.objectContaining({ _id: 'change-2', typeLabel: '支取', amountText: '-¥1000.00', beforeText: '¥51000.00', afterText: '¥50000.00' }),
      expect.objectContaining({ _id: 'legacy-change', typeLabel: '存入', amountText: '+¥1000.00', beforeText: '¥50000.00', afterText: '¥51000.00' })
    ]);
  });

  test('uses a standalone WeUI page registered in app.json', () => {
    const app = fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8');
    const markup = fs.readFileSync(path.join(__dirname, '../pages/asset-changes/asset-changes.wxml'), 'utf8');

    expect(app).toContain('pages/asset-changes/asset-changes');
    expect(markup).toContain('调整记录');
    expect(markup).toContain('weui-panel');
    expect(markup).toContain('weui-cells');
    expect(markup).toContain('wx:for="{{changes}}"');
  });

  test('shows an error when records fail to load', async () => {
    mockListAssetChanges.mockRejectedValue(new Error('offline'));
    const page = createPage();

    page.loadChanges();
    await flushPromises();
    await flushPromises();

    expect(page.data.loading).toBe(false);
    expect(page.data.errorMessage).toBe('调整记录加载失败，请稍后重试');
  });
});
