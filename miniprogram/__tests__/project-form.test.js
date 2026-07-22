const mockEnsureAllowedSession = jest.fn();
const mockCreateProject = jest.fn();
const mockUpdateProject = jest.fn();
const mockRedeemProject = jest.fn();
const mockCorrectRedemption = jest.fn();
const mockListCategories = jest.fn();
const mockListProjects = jest.fn();
const mockListUsers = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  createProject: mockCreateProject,
  updateProject: mockUpdateProject,
  redeemProject: mockRedeemProject,
  correctRedemption: mockCorrectRedemption,
  listCategories: mockListCategories,
  listProjects: mockListProjects,
  listUsers: mockListUsers
}));

let pageDefinition;

function createProjectFormPage(form) {
  const page = {
    data: {
      ...JSON.parse(JSON.stringify(pageDefinition.data)),
      form: { ...JSON.parse(JSON.stringify(pageDefinition.data.form)), ...form }
    },
    setData(update) {
      Object.keys(update).forEach((key) => {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          this.data[parent][child] = update[key];
          return;
        }
        this.data[key] = update[key];
      });
    }
  };

  page.save = pageDefinition.save.bind(page);
  page.onLoad = pageDefinition.onLoad.bind(page);
  page.redeem = pageDefinition.redeem.bind(page);
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('project form', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockEnsureAllowedSession.mockResolvedValue({ openid: 'allowed-openid' });
    mockCreateProject.mockResolvedValue();
    mockUpdateProject.mockResolvedValue();
    mockRedeemProject.mockResolvedValue();
    mockCorrectRedemption.mockResolvedValue();
    mockListCategories.mockResolvedValue({ categories: [{ _id: 'category', name: '银行理财' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockListUsers.mockResolvedValue({ users: [
      { openid: 'allowed-openid', nickname: '成员一' },
      { openid: 'second-openid', nickname: '成员二' }
    ] });
    global.wx = { showToast: jest.fn(), navigateBack: jest.fn() };
    global.Page = (definition) => { pageDefinition = definition; };
    require('../pages/project-form/project-form');
  });

  afterEach(() => {
    delete global.wx;
    delete global.Page;
  });

  test.each([
    [{ name: '项目', categoryId: 'category', principal: '0', startDate: '2026-07-01', endDate: '2026-07-28' }, '本金必须大于 0'],
    [{ name: '项目', categoryId: 'category', principal: '10000', startDate: '2026-07-28', endDate: '2026-07-01' }, '结束日期不能早于开始日期']
  ])('rejects invalid project data with %s', (form, message) => {
    const page = createProjectFormPage(form);

    page.save();

    expect(global.wx.showToast).toHaveBeenCalledWith({ title: message, icon: 'none' });
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test.each(['', 'project-id'])('rejects malformed dates without calling cloud requests', (projectId) => {
    const page = createProjectFormPage({
      name: '项目', categoryId: 'category', principal: '10000', startDate: 'abc', endDate: 'def'
    });
    page.data.projectId = projectId;

    page.save();

    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '日期格式不正确', icon: 'none' });
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  test('renders the bootstrap guidance when no categories are available', () => {
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/project-form/project-form.wxml'), 'utf8');

    expect(markup).toContain('wx:if="{{categories.length > 0}}"');
    expect(markup).toContain('请先部署并运行 bootstrap 云函数初始化品类');
  });

  test('defaults registrant selection to the caller', async () => {
    const page = createProjectFormPage();

    page.onLoad({});
    await flushPromises();
    await flushPromises();

    expect(mockListUsers).toHaveBeenCalledTimes(1);
    expect(page.data.form.registrantOpenid).toBe('allowed-openid');
    expect(page.data.selectedRegistrantName).toBe('成员一');
  });

  test('submits corrections for redeemed projects through the dedicated action', async () => {
    mockListProjects.mockResolvedValue({ projects: [{
      _id: 'redeemed-id',
      name: '已到账项目',
      categoryId: 'category',
      registrantOpenid: 'second-openid',
      principal: 10000,
      startDate: '2026-07-01',
      endDate: '2026-07-28',
      expectedAnnualRate: 0.03,
      fixedReward: 100,
      remark: '',
      manualStatus: 'redeemed',
      redeemDate: '2026-07-28',
      actualInterest: 20,
      actualFixedReward: 100
    }] });
    const page = createProjectFormPage();

    page.onLoad({ id: 'redeemed-id' });
    await flushPromises();
    await flushPromises();
    page.data.redeemForm = { redeemDate: '2026-07-30', actualInterest: '-30', actualFixedReward: '150' };
    page.redeem();
    await flushPromises();

    expect(page.data.isRedeemed).toBe(true);
    expect(mockCorrectRedemption).toHaveBeenCalledWith('redeemed-id', {
      redeemDate: '2026-07-30', actualInterest: -30, actualFixedReward: 150
    });
    expect(mockRedeemProject).not.toHaveBeenCalled();
  });
});
