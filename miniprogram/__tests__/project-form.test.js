const mockEnsureAllowedSession = jest.fn();
const mockCreateProject = jest.fn();
const mockUpdateProject = jest.fn();
const mockRedeemProject = jest.fn();
const mockCorrectRedemption = jest.fn();
const mockRemoveProject = jest.fn();
const mockListCategories = jest.fn();
const mockListProjects = jest.fn();
const mockListUsers = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  createProject: mockCreateProject,
  updateProject: mockUpdateProject,
  redeemProject: mockRedeemProject,
  correctRedemption: mockCorrectRedemption,
  removeProject: mockRemoveProject,
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
  if (pageDefinition.remove) page.remove = pageDefinition.remove.bind(page);
  if (pageDefinition.onDateChange) page.onDateChange = pageDefinition.onDateChange.bind(page);
  if (pageDefinition.onStartDateChange) page.onStartDateChange = pageDefinition.onStartDateChange.bind(page);
  if (pageDefinition.onEndDateChange) page.onEndDateChange = pageDefinition.onEndDateChange.bind(page);
  if (pageDefinition.onRedeemDateChange) page.onRedeemDateChange = pageDefinition.onRedeemDateChange.bind(page);
  return page;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    mockRemoveProject.mockResolvedValue();
    mockListCategories.mockResolvedValue({ categories: [{ _id: 'category', name: '银行理财' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockListUsers.mockResolvedValue({ users: [
      { openid: 'allowed-openid', nickname: '成员一' },
      { openid: 'second-openid', nickname: '成员二' }
    ] });
    global.wx = { showToast: jest.fn(), navigateBack: jest.fn(), showModal: jest.fn(({ success }) => success({ confirm: true })) };
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
    page.data.loading = false;
    page.data.ready = true;

    page.save();

    expect(global.wx.showToast).toHaveBeenCalledWith({ title: message, icon: 'none' });
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test.each(['', 'project-id'])('rejects malformed dates without calling cloud requests', (projectId) => {
    const page = createProjectFormPage({
      name: '项目', categoryId: 'category', principal: '10000', startDate: 'abc', endDate: 'def'
    });
    page.data.loading = false;
    page.data.ready = true;
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
    expect(page.data.ready).toBe(true);
  });

  test('captures the edit id synchronously and blocks submission when edit loading fails', async () => {
    mockListProjects.mockRejectedValue(new Error('offline'));
    const page = createProjectFormPage({
      name: '项目', categoryId: 'category', registrantOpenid: 'allowed-openid', principal: '10000',
      startDate: '2026-07-01', endDate: '2026-07-28'
    });

    page.onLoad({ id: 'edit-id' });

    expect(page.data.projectId).toBe('edit-id');
    expect(page.data.loading).toBe(true);
    page.save();
    await flushPromises();
    await flushPromises();

    expect(page.data.ready).toBe(false);
    expect(page.data.errorMessage).toBe('项目加载失败，请稍后重试');
    page.save();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  test('ignores duplicate project saves while the first request is pending', async () => {
    const pending = deferred();
    mockCreateProject.mockReturnValue(pending.promise);
    const page = createProjectFormPage();
    page.onLoad({});
    await flushPromises();
    await flushPromises();
    page.data.form = {
      name: '项目', categoryId: 'category', registrantOpenid: 'allowed-openid', principal: '10000',
      startDate: '2026-07-01', endDate: '2026-07-28', expectedAnnualRate: '', fixedReward: '', remark: ''
    };

    page.save();
    page.save();

    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    expect(page.data.saving).toBe(true);
    pending.resolve();
    await flushPromises();
    expect(page.data.saving).toBe(false);
  });

  test.each([
    [false, mockRedeemProject, mockCorrectRedemption],
    [true, mockCorrectRedemption, mockRedeemProject]
  ])('ignores duplicate redemption mutations while pending (redeemed: %s)', async (isRedeemed, expectedRequest, otherRequest) => {
    const pending = deferred();
    expectedRequest.mockReturnValue(pending.promise);
    const page = createProjectFormPage();
    page.data.ready = true;
    page.data.loading = false;
    page.data.projectId = 'project-id';
    page.data.isRedeemed = isRedeemed;
    page.data.redeemForm = { redeemDate: '2026-07-28', actualInterest: '20', actualFixedReward: '100' };

    page.redeem();
    page.redeem();

    expect(expectedRequest).toHaveBeenCalledTimes(1);
    expect(otherRequest).not.toHaveBeenCalled();
    expect(page.data.redeeming).toBe(true);
    pending.resolve();
    await flushPromises();
    expect(page.data.redeeming).toBe(false);
  });

  test('renders loading and error states and disables mutation controls while busy', () => {
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/project-form/project-form.wxml'), 'utf8');

    expect(markup).toContain('wx:if="{{loading}}"');
    expect(markup).toContain('wx:elif="{{errorMessage}}"');
    expect(markup).toContain('disabled="{{saving || redeeming || removing}}"');
  });

  test('uses explicit field height to prevent placeholder clipping', () => {
    const fs = require('fs');
    const path = require('path');
    const markup = fs.readFileSync(path.join(__dirname, '../pages/project-form/project-form.wxml'), 'utf8');
    const styles = fs.readFileSync(path.join(__dirname, '../pages/project-form/project-form.wxss'), 'utf8');

    expect(markup).toContain('{{startDateText}}');
    expect(markup).not.toContain('class="form-label"');
    expect(styles).toContain('height: 96rpx');
    expect(styles).toContain('line-height: 56rpx');
    expect(styles).toContain('padding: 20rpx');
  });

  test('renders date pickers and updates selected date values', () => {
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/project-form/project-form.wxml'), 'utf8');
    const page = createProjectFormPage();

    page.onStartDateChange({ detail: { value: '2026-07-02' } });
    page.onEndDateChange({ detail: { value: '2026-07-29' } });
    page.onRedeemDateChange({ currentTarget: { dataset: { field: 'redeemDate' } }, detail: { value: '2026-07-30' } });

    expect(markup).toContain('mode="date"');
    expect(markup).toContain('bindchange="onStartDateChange"');
    expect(markup).toContain('bindchange="onEndDateChange"');
    expect(markup).toContain('bindchange="onRedeemDateChange"');
    expect(markup).toContain('{{startDateText}}');
    expect(markup).toContain('{{endDateText}}');
    expect(page.data.form.startDate).toBe('2026-07-02');
    expect(page.data.form.endDate).toBe('2026-07-29');
    expect(page.data.startDateText).toBe('2026-07-02');
    expect(page.data.endDateText).toBe('2026-07-29');
    expect(page.data.redeemForm.redeemDate).toBe('2026-07-30');
  });

  test('locks existing active projects and exposes delete from the detail form', async () => {
    mockListProjects.mockResolvedValue({ projects: [{
      _id: 'active-id',
      name: '进行中项目',
      categoryId: 'category',
      registrantOpenid: 'allowed-openid',
      principal: 10000,
      startDate: '2026-07-01',
      endDate: '2026-07-28',
      expectedAnnualRate: 0.03,
      fixedReward: 100,
      remark: '',
      manualStatus: 'active'
    }] });
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/project-form/project-form.wxml'), 'utf8');
    const page = createProjectFormPage();

    page.onLoad({ id: 'active-id' });
    await flushPromises();
    await flushPromises();

    expect(page.data.isLocked).toBe(true);
    expect(page.data.lockedMessage).toContain('创建后');
    expect(markup).toContain('bindtap="remove"');
    expect(markup).toContain('删除项目');
    page.save();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  test('deletes an existing project after confirmation', async () => {
    const page = createProjectFormPage();
    page.data.ready = true;
    page.data.loading = false;
    page.data.projectId = 'project-id';

    page.remove();
    await flushPromises();

    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除项目',
      confirmText: '删除'
    }));
    expect(mockRemoveProject).toHaveBeenCalledWith('project-id');
    expect(global.wx.navigateBack).toHaveBeenCalled();
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
