const mockEnsureAllowedSession = jest.fn();
const mockListProjects = jest.fn();
const mockListCategories = jest.fn();
const mockListUsers = jest.fn();
const mockCancelProject = jest.fn();
const mockRemoveProject = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  listProjects: mockListProjects,
  listCategories: mockListCategories,
  listUsers: mockListUsers,
  cancelProject: mockCancelProject,
  removeProject: mockRemoveProject
}));

let pageDefinition;

function createPage() {
  const page = {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) { this.data = { ...this.data, ...update }; }
  };
  ['onShow', 'loadProjects', 'applyFilters', 'onStatusChange', 'cancelProject', 'removeProject']
    .forEach((method) => { page[method] = pageDefinition[method].bind(page); });
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('project list management', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00'));
    mockEnsureAllowedSession.mockResolvedValue({ openid: 'allowed-openid' });
    mockListCategories.mockResolvedValue({ categories: [{ _id: 'cat-1', name: '银行理财' }] });
    mockListUsers.mockResolvedValue({ users: [
      { openid: 'allowed-openid', nickname: '成员一' },
      { openid: 'second-openid', nickname: '成员二' }
    ] });
    mockListProjects.mockResolvedValue({ projects: [
      {
        _id: 'redeemed', name: '已到账', categoryId: 'cat-1', registrantOpenid: 'second-openid',
        principal: 10000, startDate: '2025-12-01', endDate: '2026-01-01', redeemDate: '2026-01-02',
        expectedInterest: 20, fixedReward: 100, actualInterest: 20, actualFixedReward: 100, manualStatus: 'redeemed'
      },
      {
        _id: 'due', name: '三天到期', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 5000, startDate: '2026-07-01', endDate: '2026-07-25', manualStatus: 'active'
      },
      {
        _id: 'overdue', name: '待确认', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 8000, startDate: '2026-06-01', endDate: '2026-07-20', manualStatus: 'active'
      }
    ] });
    mockCancelProject.mockResolvedValue({ ok: true });
    mockRemoveProject.mockResolvedValue({ ok: true });
    global.wx = {
      navigateTo: jest.fn(),
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true }))
    };
    global.Page = (definition) => { pageDefinition = definition; };
    require('../pages/projects/projects');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.wx;
    delete global.Page;
  });

  test('derives statuses, actual return, and prioritizes action-needed projects', async () => {
    const page = createPage();
    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.projects.map((item) => item._id)).toEqual(['overdue', 'due', 'redeemed']);
    expect(page.data.projects.map((item) => item.dateStatus)).toEqual(['overdue_pending', 'due_soon', 'redeemed']);
    expect(page.data.projects.find((item) => item._id === 'redeemed').actualTotalText).toBe('¥120.00');
  });

  test('filters by derived status, category, registrant, and project year', async () => {
    const page = createPage();
    page.loadProjects();
    await flushPromises();
    await flushPromises();

    page.setData({ filters: { status: 'redeemed', categoryId: 'cat-1', registrantOpenid: 'second-openid', year: '2025' } });
    page.applyFilters();

    expect(page.data.projects.map((item) => item._id)).toEqual(['redeemed']);
  });

  test('confirms cancel and remove actions before calling cloud services', async () => {
    const page = createPage();
    page.cancelProject({ detail: { id: 'due' } });
    page.removeProject({ detail: { id: 'redeemed' } });
    await flushPromises();

    expect(global.wx.showModal).toHaveBeenCalledTimes(2);
    expect(mockCancelProject).toHaveBeenCalledWith('due');
    expect(mockRemoveProject).toHaveBeenCalledWith('redeemed');
  });

  test('shows a page-level error when project loading fails', async () => {
    mockListProjects.mockRejectedValue(new Error('offline'));
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.errorMessage).toBe('项目加载失败，请稍后重试');
  });
});
