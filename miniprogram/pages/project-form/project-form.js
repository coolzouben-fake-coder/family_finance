const { ensureAllowedSession } = require('../../services/session');
const { createProject, updateProject, redeemProject, listCategories, listProjects } = require('../../services/cloud');
const { daysInclusive } = require('../../utils/date');
const { calcExpectedInterest } = require('../../utils/finance');

function emptyForm() {
  return { name: '', categoryId: '', principal: '', startDate: '', endDate: '', expectedAnnualRate: '', fixedReward: '', remark: '' };
}

function showError(error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }

Page({
  data: {
    projectId: '', categories: [], selectedCategoryName: '', isLocked: false, lockedMessage: '', saving: false, redeeming: false,
    form: emptyForm(), redeemForm: { redeemDate: '', actualInterest: '', actualFixedReward: '' }
  },
  onLoad(options) {
    const projectId = options.id || '';
    ensureAllowedSession()
      .then(() => Promise.all([listCategories(), projectId ? listProjects() : Promise.resolve({ projects: [] })]))
      .then(([{ categories }, { projects }]) => {
        const project = projects.find((item) => item._id === projectId);
        if (projectId && !project) throw new Error('PROJECT_NOT_FOUND');
        const selectedCategory = project && categories.find((item) => item._id === project.categoryId);
        this.setData({
          projectId, categories, selectedCategoryName: selectedCategory ? selectedCategory.name : '',
          isLocked: Boolean(project && project.manualStatus !== 'active'),
          lockedMessage: project && project.manualStatus === 'cancelled' ? '此项目已取消，记录不可再编辑。' : '此项目已到账，记录不可再编辑。',
          form: project ? {
            name: project.name, categoryId: project.categoryId, principal: String(project.principal), startDate: project.startDate,
            endDate: project.endDate, expectedAnnualRate: String(project.expectedAnnualRate || ''),
            fixedReward: String(project.fixedReward || ''), remark: project.remark || ''
          } : emptyForm(),
          redeemForm: project && project.manualStatus === 'redeemed' ? {
            redeemDate: project.redeemDate, actualInterest: String(project.actualInterest || ''), actualFixedReward: String(project.actualFixedReward || '')
          } : this.data.redeemForm
        });
      })
      .catch(showError);
  },
  onInput(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  onRedeemInput(event) { this.setData({ [`redeemForm.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  onCategoryChange(event) {
    const category = this.data.categories[Number(event.detail.value)];
    this.setData({ selectedCategoryName: category.name, 'form.categoryId': category._id });
  },
  save() {
    const form = this.data.form;
    const principal = Number(form.principal);
    const expectedAnnualRate = Number(form.expectedAnnualRate || 0);
    const holdingDays = daysInclusive(form.startDate, form.endDate);
    if (!Number.isFinite(holdingDays) || holdingDays < 1) {
      showError(new Error('请填写有效的开始和结束日期'));
      return;
    }
    const project = {
      ...form, principal, expectedAnnualRate, fixedReward: Number(form.fixedReward || 0),
      expectedInterest: calcExpectedInterest(principal, expectedAnnualRate, holdingDays)
    };
    this.setData({ saving: true });
    const request = this.data.projectId ? updateProject(this.data.projectId, project) : createProject(project);
    request.then(() => wx.navigateBack()).catch(showError).finally(() => this.setData({ saving: false }));
  },
  redeem() {
    this.setData({ redeeming: true });
    redeemProject(this.data.projectId, {
      ...this.data.redeemForm,
      actualInterest: Number(this.data.redeemForm.actualInterest || 0),
      actualFixedReward: Number(this.data.redeemForm.actualFixedReward || 0)
    }).then(() => wx.navigateBack()).catch(showError).finally(() => this.setData({ redeeming: false }));
  }
});
