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
  ['onShow', 'loadProjects', 'applyFilters', 'onStatusChange', 'onYearChange', 'cancelProject', 'removeProject']
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
        principal: 5000, startDate: '2026-07-01', endDate: '2026-07-25', manualStatus: 'active',
        principalStatus: 'holding', rewardStatus: 'pending'
      },
      {
        _id: 'overdue', name: '待确认', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 8000, startDate: '2026-06-01', endDate: '2026-07-20', manualStatus: 'active',
        principalStatus: 'holding', rewardStatus: 'pending'
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
    expect(page.data.projects.find((item) => item._id === 'due').displayStatus).toBe('本金和奖励待到账');
    expect(page.data.projects.find((item) => item._id === 'due').filterStatus).toBe('principal_reward_pending');
    expect(page.data.projects.find((item) => item._id === 'redeemed').canRemove).toBe(false);
    expect(page.data.projects.find((item) => item._id === 'due').canRemove).toBe(true);
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

  test('uses plain year strings in the year picker so concrete years render', async () => {
    const fs = require('fs');
    const path = require('path');
    const markup = fs.readFileSync(path.join(__dirname, '../pages/projects/projects.wxml'), 'utf8');
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.yearOptions).toEqual(['全部年份', '2026', '2025']);
    expect(markup).toContain('range="{{yearOptions}}" bindchange="onYearChange"');
    expect(markup).not.toContain('range="{{yearOptions}}" range-key="label"');

    page.onYearChange({ detail: { value: 1 } });

    expect(page.data.filters.year).toBe('2026');
    expect(page.data.selectedYearLabel).toBe('2026');
  });

  test('uses simplified settlement statuses for the status filter', async () => {
    const page = createPage();
    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.statusOptions.map((item) => item.label)).toEqual([
      '全部状态', '本金和奖励待到账', '本金待到账', '奖励待到账', '已到账', '已取消', '未开始'
    ]);
    expect(page.data.statusOptions.map((item) => item.value)).not.toEqual(expect.arrayContaining([
      'overdue_pending', 'due_soon', 'active'
    ]));

    page.setData({ filters: { status: 'principal_reward_pending', categoryId: '', registrantOpenid: '', year: '' } });
    page.applyFilters();

    expect(page.data.projects.map((item) => item._id)).toEqual(['overdue', 'due']);
  });

  test('sorts projects with the same status by end date descending', async () => {
    mockListProjects.mockResolvedValue({ projects: [
      {
        _id: 'earlier', name: '较早结束', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 10000, startDate: '2026-01-01', endDate: '2026-02-01', redeemDate: '2026-02-01',
        actualInterest: 20, actualFixedReward: 0, manualStatus: 'redeemed'
      },
      {
        _id: 'later', name: '较晚结束', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 10000, startDate: '2026-01-01', endDate: '2026-03-01', redeemDate: '2026-03-01',
        actualInterest: 30, actualFixedReward: 0, manualStatus: 'redeemed'
      }
    ] });
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.projects.map((item) => item._id)).toEqual(['later', 'earlier']);
  });

  test('sorts active projects by end date ascending', async () => {
    mockListProjects.mockResolvedValue({ projects: [
      {
        _id: 'active-later', name: '较晚到期进行中', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 10000, startDate: '2026-07-01', endDate: '2026-09-01', manualStatus: 'active'
      },
      {
        _id: 'active-earlier', name: '较早到期进行中', categoryId: 'cat-1', registrantOpenid: 'allowed-openid',
        principal: 10000, startDate: '2026-07-01', endDate: '2026-08-01', manualStatus: 'active'
      }
    ] });
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.projects.map((item) => item._id)).toEqual(['active-earlier', 'active-later']);
  });

  test('keeps reward-received projects in normal due-date ordering before principal redemption', async () => {
    mockListProjects.mockResolvedValue({ projects: [{
      _id: 'return-received',
      name: '奖励已到账',
      categoryId: 'cat-1',
      registrantOpenid: 'allowed-openid',
      principal: 10000,
      startDate: '2026-07-01',
      endDate: '2026-07-24',
      actualInterest: 20,
      actualFixedReward: 100,
      manualStatus: 'active',
      principalStatus: 'holding',
      rewardStatus: 'received',
      rewardReceivedDate: '2026-07-20'
    }] });
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.projects[0].actualTotalText).toBe('¥120.00');
    expect(page.data.projects[0].actualAnnualRateText).toBe('-');
    expect(page.data.projects[0].dateStatus).toBe('due_soon');
    expect(page.data.projects[0].displayStatus).toBe('本金待到账');
    expect(page.data.projects[0].filterStatus).toBe('principal_pending');
  });

  test('keeps principal-released reward-pending projects in pending-confirmation ordering', async () => {
    mockListProjects.mockResolvedValue({ projects: [{
      _id: 'reward-pending',
      name: '奖励待到账',
      categoryId: 'cat-1',
      registrantOpenid: 'allowed-openid',
      principal: 10000,
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      redeemDate: '2026-07-10',
      actualInterest: 30,
      actualFixedReward: 0,
      manualStatus: 'active',
      principalStatus: 'released',
      rewardStatus: 'pending'
    }] });
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.projects[0].dateStatus).toBe('overdue_pending');
    expect(page.data.projects[0].displayStatus).toBe('奖励待到账');
    expect(page.data.projects[0].filterStatus).toBe('reward_pending');
    expect(page.data.projects[0].actualTotalText).toBe('¥30.00');
    expect(page.data.projects[0].actualAnnualRateText).toBe('10.95%');
  });

  test('confirms cancel and only removes non-redeemed projects', async () => {
    const page = createPage();
    page.data.projects = [
      { _id: 'due', canRemove: true },
      { _id: 'redeemed', canRemove: false }
    ];
    page.cancelProject({ detail: { id: 'due' } });
    page.removeProject({ detail: { id: 'redeemed' } });
    page.removeProject({ detail: { id: 'due' } });
    await flushPromises();

    expect(global.wx.showModal).toHaveBeenCalledTimes(2);
    expect(mockCancelProject).toHaveBeenCalledWith('due');
    expect(mockRemoveProject).not.toHaveBeenCalledWith('redeemed');
    expect(mockRemoveProject).toHaveBeenCalledWith('due');
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '已到账项目不可删除', icon: 'none' });
  });

  test('shows a page-level error when project loading fails', async () => {
    mockListProjects.mockRejectedValue(new Error('offline'));
    const page = createPage();

    page.loadProjects();
    await flushPromises();
    await flushPromises();

    expect(page.data.errorMessage).toBe('项目加载失败，请稍后重试');
  });

  test('uses WeUI panels, cells, and buttons for the project list surface', () => {
    const fs = require('fs');
    const path = require('path');
    const markup = fs.readFileSync(path.join(__dirname, '../pages/projects/projects.wxml'), 'utf8');
    const cardMarkup = fs.readFileSync(path.join(__dirname, '../components/project-card/project-card.wxml'), 'utf8');
    const cardStyles = fs.readFileSync(path.join(__dirname, '../components/project-card/project-card.wxss'), 'utf8');

    expect(markup).toContain('weui-btn weui-btn_primary');
    expect(markup).toContain('weui-cells');
    expect(markup).toContain('weui-cell');
    expect(cardMarkup).toContain('weui-panel');
    expect(cardMarkup).toContain('weui-cell');
    expect(cardMarkup).toContain('wx:if="{{project.canCancel}}"');
    expect(cardMarkup).toContain('wx:if="{{project.canRemove}}"');
    expect(cardMarkup).not.toContain("project.manualStatus === 'active'");
    expect(cardStyles).toContain('.card-action--remove.weui-btn_warn');
    expect(cardStyles).toContain('background: var(--weui-RED)');
    expect(cardStyles).toContain('color: #FFFFFF');
  });
});
