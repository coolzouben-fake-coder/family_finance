const mockEnsureAllowedSession = jest.fn();
const mockGetAnnualStats = jest.fn();
const mockListCategories = jest.fn();
const mockListUsers = jest.fn();
const mockListProjects = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  getAnnualStats: mockGetAnnualStats,
  listCategories: mockListCategories,
  listUsers: mockListUsers,
  listProjects: mockListProjects
}));

let pageDefinition;

function createPage() {
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) { this.data = { ...this.data, ...update }; }
  };
  ['onLoad', 'loadYearBounds', 'loadStats', 'onYearChange'].forEach((method) => {
    page[method] = pageDefinition[method].bind(page);
  });
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('annual statistics page', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00'));
    mockEnsureAllowedSession.mockResolvedValue({ openid: 'allowed-openid' });
    mockListCategories.mockResolvedValue({ categories: [{ _id: 'cat-1', name: '银行理财' }] });
    mockListUsers.mockResolvedValue({ users: [{ openid: 'allowed-openid', nickname: '成员一' }] });
    mockListProjects.mockResolvedValue({ projects: [
      { _id: 'old', startDate: '2025-12-26' },
      { _id: 'current', startDate: '2026-07-01' }
    ] });
    mockGetAnnualStats.mockResolvedValue({ stats: {
      totalReturn: 120,
      actualInterestTotal: 90,
      actualFixedRewardTotal: 30,
      annualizedRate: 0.12,
      familyAssetReturnRate: 0.006,
      averageFamilyAssets: 20000,
      interestShare: 0.75,
      fixedRewardShare: 0.25,
      monthly: [{ month: '2026-07', amount: 120 }],
      byCategory: [{ categoryId: 'cat-1', projectCount: 1, principal: 10000, actualTotalReturn: 120, share: 1 }],
      byRegistrant: [{
        registrantOpenid: 'allowed-openid', projectCount: 1, principal: 10000,
        actualTotalReturn: 120, annualizedRate: 0.12
      }]
    } });
    global.Page = (definition) => { pageDefinition = definition; };
    require('../pages/stats/stats');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
  });

  test('renders category and registrant annualized aggregations', async () => {
    const page = createPage();
    page.onLoad();
    await flushPromises();
    await flushPromises();

    expect(page.data.byCategory).toEqual([expect.objectContaining({ categoryName: '银行理财', actualTotalReturnText: '¥120.00' })]);
    expect(page.data.byCategory[0].shareText).toBe('100.00%');
    expect(page.data.returnBreakdown).toEqual([
      { key: 'interest', label: '实际利息', amountText: '¥90.00', shareText: '75.00%' },
      { key: 'fixedReward', label: '实际固定奖励', amountText: '¥30.00', shareText: '25.00%' }
    ]);
    expect(page.data.familyAssetReturnRate).toBe('0.60%');
    expect(page.data.averageFamilyAssets).toBe('¥20000.00');
    expect(page.data.byRegistrant).toEqual([expect.objectContaining({ registrantName: '成员一', annualizedRateText: '12.00%' })]);
    expect(page.data.loading).toBe(false);
  });

  test('renders category proportions and the two-part actual return breakdown', () => {
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/stats/stats.wxml'), 'utf8');

    expect(markup).toContain('收益构成');
    expect(markup).toContain('{{item.shareText}}');
    expect(markup).toContain('品类收益占比');
    expect(markup).toContain('家庭资产收益率');
    expect(markup).toContain('日均家庭总资产');
    expect(markup).toContain('weui-panel');
    expect(markup).toContain('weui-cells');
    expect(markup).toContain('weui-cell');
  });

  test('reloads annual statistics when the selected year changes', async () => {
    const page = createPage();

    page.onYearChange({ detail: { value: '2025' } });
    await flushPromises();

    expect(page.data.year).toBe('2025');
    expect(mockGetAnnualStats).toHaveBeenCalledWith(2025);
  });

  test('defaults the year picker to the current year while allowing historical project years', async () => {
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/stats/stats.wxml'), 'utf8');
    const page = createPage();

    page.onLoad();
    await flushPromises();
    await flushPromises();

    expect(page.data.currentYear).toBe('2026');
    expect(page.data.year).toBe('2026');
    expect(page.data.startYear).toBe('2025');
    expect(markup).toContain('fields="year"');
    expect(markup).toContain('value="{{year}}"');
    expect(markup).toContain('start="{{startYear}}"');
    expect(markup).toContain('end="{{currentYear}}"');
  });

  test('shows a page-level error when annual statistics fail to load', async () => {
    mockGetAnnualStats.mockRejectedValue(new Error('offline'));
    const page = createPage();

    page.loadStats();
    await flushPromises();
    await flushPromises();

    expect(page.data.errorMessage).toBe('收益统计加载失败，请稍后重试');
    expect(page.data.loading).toBe(false);
  });
});
