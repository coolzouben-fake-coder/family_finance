const mockEnsureAllowedSession = jest.fn();
const mockGetAssets = jest.fn();
const mockListProjects = jest.fn();
const mockUpdateAssets = jest.fn();
const mockListAssetChanges = jest.fn();
const fs = require('fs');
const path = require('path');

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  getAssets: mockGetAssets,
  listProjects: mockListProjects,
  updateAssets: mockUpdateAssets,
  listAssetChanges: mockListAssetChanges
}));

let pageDefinition;

function createHomePage() {
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) {
      this.data = { ...this.data, ...update };
    }
  };

  page.loadDashboard = pageDefinition.loadDashboard.bind(page);
  page.startAssetEdit = pageDefinition.startAssetEdit.bind(page);
  page.saveAssets = pageDefinition.saveAssets.bind(page);
  page.onAssetTypeChange = pageDefinition.onAssetTypeChange.bind(page);
  page.toggleAssetChanges = pageDefinition.toggleAssetChanges.bind(page);
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('home dashboard', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00'));
    mockEnsureAllowedSession.mockResolvedValue();
    mockGetAssets.mockResolvedValue({ asset: { totalAmount: 50000 } });
    mockListAssetChanges.mockResolvedValue({ changes: [
      { _id: 'change-2', type: 'withdraw', amount: 1000, beforeAmount: 51000, afterAmount: 50000, reason: '支取备用', createdAt: '2026-07-22T10:00:00Z' },
      { _id: 'legacy-change', beforeAmount: 50000, afterAmount: 51000, reason: '历史存入', createdAt: '2026-07-21T10:00:00Z' }
    ] });
    mockListProjects.mockResolvedValue({
      projects: [
        { _id: 'due', name: '三日内到期', principal: 20000, startDate: '2026-07-01', endDate: '2026-07-24', expectedInterest: 40, fixedReward: 60, manualStatus: 'active' },
        { _id: 'overdue', name: '已到期', principal: 10000, startDate: '2026-07-01', endDate: '2026-07-21', expectedInterest: 20, fixedReward: 30, manualStatus: 'active' },
        { _id: 'redeemed', name: '已到账', principal: 5000, startDate: '2026-07-01', endDate: '2026-07-20', actualInterest: 25, actualFixedReward: 75, manualStatus: 'redeemed' }
      ]
    });
    mockUpdateAssets.mockResolvedValue({ asset: { totalAmount: 60000 } });
    global.wx = { showToast: jest.fn() };
    global.Page = (definition) => { pageDefinition = definition; };
    require('../pages/home/home');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
  });

  test('loads active capital and separates due reminder projects', async () => {
    const page = createHomePage();
    page.loadDashboard();
    await flushPromises();
    await flushPromises();

    expect(mockListProjects).toHaveBeenCalledTimes(1);
    expect(page.data.metrics).toEqual({
      totalAssets: '¥50000.00',
      investedAmount: '¥30000.00',
      idleAmount: '¥20000.00',
      utilizationRate: '60.0%',
      inTransitReturn: '¥150.00',
      realizedReturn: '¥100.00'
    });
    expect(page.data.dueSoonProjects.map((project) => project._id)).toEqual(['due']);
    expect(page.data.overdueProjects.map((project) => project._id)).toEqual(['overdue']);
    expect(page.data.dashboardReady).toBe(true);
    expect(mockListAssetChanges).toHaveBeenCalledTimes(1);
    expect(page.data.assetChanges).toEqual([
      expect.objectContaining({ _id: 'change-2', typeLabel: '支取', amountText: '-¥1000.00', beforeText: '¥51000.00', afterText: '¥50000.00' }),
      expect.objectContaining({ _id: 'legacy-change', typeLabel: '存入', amountText: '+¥1000.00', beforeText: '¥50000.00', afterText: '¥51000.00' })
    ]);
  });

  test('does not expose or seed the asset editor before dashboard data loads', async () => {
    const page = createHomePage();
    const markup = fs.readFileSync(path.join(__dirname, '../pages/home/home.wxml'), 'utf8');

    expect(page.data.totalAssetsValue).toBeNull();
    expect(page.data.dashboardReady).toBe(false);
    expect(markup).toContain('wx:if="{{dashboardReady}}" class="grid"');
    expect(markup).toContain('当前投资总金额');
    expect(markup).toContain('在途收益');
    expect(markup).toContain('已到账收益');
    expect(markup).toContain('wx:if="{{loading && !dashboardReady && !errorMessage}}"');
    expect(markup).toContain('wx:if="{{dashboardReady && !editingAssets}}"');
    expect(markup).toContain('调整记录');
    expect(markup).toContain('wx:for="{{assetChanges}}"');
    page.startAssetEdit();

    expect(page.data.editingAssets).toBe(false);
    expect(page.data.assetAmountInput).toBe('');
  });

  test('uses distinct warning and danger accents for reminder states', () => {
    const markup = fs.readFileSync(path.join(__dirname, '../pages/home/home.wxml'), 'utf8');
    const styles = fs.readFileSync(path.join(__dirname, '../pages/home/home.wxss'), 'utf8');

    expect(markup).toContain('class="reminder reminder--overdue"');
    expect(markup).toContain('class="reminder reminder--due-soon"');
    expect(styles).toContain('.reminder--overdue');
    expect(styles).toContain('border-left: 6rpx solid var(--color-danger)');
    expect(styles).toContain('.reminder--due-soon');
    expect(styles).toContain('border-left: 6rpx solid var(--color-warning)');
  });

  test('records a deposit from the dashboard with a required reason', async () => {
    const page = createHomePage();
    page.data.totalAssetsValue = 50000;
    page.data.dashboardReady = true;
    page.data.loading = false;
    page.startAssetEdit();
    page.data.assetChangeType = 'deposit';
    page.data.assetAmountInput = '10000';
    page.data.assetReasonInput = '工资到账';

    page.saveAssets();
    await flushPromises();
    await flushPromises();

    expect(mockUpdateAssets).toHaveBeenCalledWith('deposit', 10000, '工资到账');
    expect(page.data.editingAssets).toBe(false);
  });

  test('records a withdraw from the dashboard', async () => {
    const page = createHomePage();
    page.data.dashboardReady = true;
    page.data.loading = false;
    page.onAssetTypeChange({ currentTarget: { dataset: { type: 'withdraw' } } });
    page.data.assetAmountInput = '3000';
    page.data.assetReasonInput = '生活备用';

    page.saveAssets();
    await flushPromises();
    await flushPromises();

    expect(mockUpdateAssets).toHaveBeenCalledWith('withdraw', 3000, '生活备用');
  });

  test('does not update assets without a reason', () => {
    const page = createHomePage();
    page.data.dashboardReady = true;
    page.data.loading = false;
    page.data.assetAmountInput = '10000';
    page.data.assetReasonInput = '   ';

    page.saveAssets();

    expect(mockUpdateAssets).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '请填写调整原因', icon: 'none' });
  });

  test('does not update assets without a positive amount', () => {
    const page = createHomePage();
    page.data.dashboardReady = true;
    page.data.loading = false;
    page.data.assetAmountInput = '0';
    page.data.assetReasonInput = '资产调整';

    page.saveAssets();

    expect(mockUpdateAssets).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '调整金额必须大于 0', icon: 'none' });
  });

  test('ignores duplicate asset saves while the first update is pending', async () => {
    const pending = deferred();
    mockUpdateAssets.mockReturnValue(pending.promise);
    const page = createHomePage();
    page.data.dashboardReady = true;
    page.data.loading = false;
    page.data.assetAmountInput = '10000';
    page.data.assetReasonInput = '工资到账';

    page.saveAssets();
    page.saveAssets();

    expect(mockUpdateAssets).toHaveBeenCalledTimes(1);
    expect(page.data.savingAssets).toBe(true);
    pending.resolve({ asset: { totalAmount: 60000 } });
    await flushPromises();
  });

  test('toggles the asset change record list', () => {
    const page = createHomePage();

    page.toggleAssetChanges();
    expect(page.data.showingAssetChanges).toBe(true);
    page.toggleAssetChanges();
    expect(page.data.showingAssetChanges).toBe(false);
  });

  test('shows a page-level error when dashboard loading fails', async () => {
    mockGetAssets.mockRejectedValue(new Error('offline'));
    const page = createHomePage();

    page.loadDashboard();
    await flushPromises();
    await flushPromises();

    expect(page.data.loading).toBe(false);
    expect(page.data.dashboardReady).toBe(false);
    expect(page.data.errorMessage).toBe('资金看板加载失败，请稍后重试');
    const markup = fs.readFileSync(path.join(__dirname, '../pages/home/home.wxml'), 'utf8');
    expect(markup).toContain('wx:if="{{errorMessage}}"');
    expect(markup).toContain('wx:if="{{dashboardReady}}" class="section"');
    page.startAssetEdit();
    page.data.assetAmountInput = '0';
    page.data.assetReasonInput = '错误覆盖';
    page.saveAssets();
    expect(page.data.editingAssets).toBe(false);
    expect(mockUpdateAssets).not.toHaveBeenCalled();
  });

  test('keeps dashboard usable when asset change records fail to load', async () => {
    mockListAssetChanges.mockRejectedValue(new Error('records unavailable'));
    const page = createHomePage();

    page.loadDashboard();
    await flushPromises();
    await flushPromises();

    expect(page.data.dashboardReady).toBe(true);
    expect(page.data.errorMessage).toBe('');
    expect(page.data.metrics.totalAssets).toBe('¥50000.00');
    expect(page.data.assetChanges).toEqual([]);
  });
});
