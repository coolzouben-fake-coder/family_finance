const mockEnsureAllowedSession = jest.fn();
const mockGetAnnualStats = jest.fn();
const mockListCategories = jest.fn();
const mockListUsers = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  getAnnualStats: mockGetAnnualStats,
  listCategories: mockListCategories,
  listUsers: mockListUsers
}));

let pageDefinition;

function createPage() {
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) { this.data = { ...this.data, ...update }; }
  };
  ['onLoad', 'loadStats', 'onYearChange'].forEach((method) => {
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
    mockGetAnnualStats.mockResolvedValue({ stats: {
      totalReturn: 120,
      annualizedRate: 0.12,
      fixedRewardShare: 0.25,
      monthly: [{ month: '2026-07', amount: 120 }],
      byCategory: [{ categoryId: 'cat-1', projectCount: 1, principal: 10000, actualTotalReturn: 120 }],
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
    expect(page.data.byRegistrant).toEqual([expect.objectContaining({ registrantName: '成员一', annualizedRateText: '12.00%' })]);
    expect(page.data.loading).toBe(false);
  });

  test('reloads annual statistics when the selected year changes', async () => {
    const page = createPage();

    page.onYearChange({ detail: { value: '2025' } });
    await flushPromises();

    expect(page.data.year).toBe(2025);
    expect(mockGetAnnualStats).toHaveBeenCalledWith(2025);
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
