const mockEnsureAllowedSession = jest.fn();
const mockCreateProject = jest.fn();

jest.mock('../services/session', () => ({ ensureAllowedSession: mockEnsureAllowedSession }));
jest.mock('../services/cloud', () => ({
  createProject: mockCreateProject,
  updateProject: jest.fn(),
  redeemProject: jest.fn(),
  listCategories: jest.fn(),
  listProjects: jest.fn()
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
  return page;
}

describe('project form', () => {
  beforeEach(() => {
    jest.resetModules();
    mockEnsureAllowedSession.mockResolvedValue();
    mockCreateProject.mockResolvedValue();
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

  test('renders the bootstrap guidance when no categories are available', () => {
    const markup = require('fs').readFileSync(require('path').join(__dirname, '../pages/project-form/project-form.wxml'), 'utf8');

    expect(markup).toContain('wx:if="{{categories.length > 0}}"');
    expect(markup).toContain('请先部署并运行 bootstrap 云函数初始化品类');
  });
});
