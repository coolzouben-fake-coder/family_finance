const mockEnsureAllowedSession = jest.fn();
const mockGetAssets = jest.fn();
const mockListProjects = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({ getAssets: mockGetAssets, listProjects: mockListProjects }));

let pageDefinition;

function createHomePage() {
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) {
      this.data = { ...this.data, ...update };
    }
  };

  page.loadDashboard = pageDefinition.loadDashboard.bind(page);
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('home dashboard', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00'));
    mockEnsureAllowedSession.mockResolvedValue();
    mockGetAssets.mockResolvedValue({ asset: { totalAmount: 50000 } });
    mockListProjects.mockResolvedValue({
      projects: [
        { _id: 'due', name: '三日内到期', principal: 20000, startDate: '2026-07-01', endDate: '2026-07-24', manualStatus: 'active' },
        { _id: 'overdue', name: '已到期', principal: 10000, startDate: '2026-07-01', endDate: '2026-07-21', manualStatus: 'active' }
      ]
    });
    global.Page = (definition) => { pageDefinition = definition; };
    require('../pages/home/home');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
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
      utilizationRate: '60.0%'
    });
    expect(page.data.dueSoonProjects.map((project) => project._id)).toEqual(['due']);
    expect(page.data.overdueProjects.map((project) => project._id)).toEqual(['overdue']);
  });
});
