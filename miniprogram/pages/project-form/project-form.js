const { ensureAllowedSession } = require('../../services/session');
const {
  createProject, updateProject, redeemProject, correctRedemption, listCategories, listProjects, listUsers
} = require('../../services/cloud');
const { daysInclusive } = require('../../utils/date');
const { calcExpectedInterest } = require('../../utils/finance');

function emptyForm() {
  return {
    name: '', categoryId: '', registrantOpenid: '', principal: '', startDate: '', endDate: '',
    expectedAnnualRate: '', fixedReward: '', remark: ''
  };
}

function showError(error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }

function isValidDateInput(dateText) {
  if (typeof dateText !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;

  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateForm(form) {
  if (!form.name) return '请填写项目名称';
  if (!form.categoryId) return '请选择品类';
  if (!(Number(form.principal) > 0)) return '本金必须大于 0';
  if (!form.startDate || !form.endDate) return '请填写开始日期和结束日期';
  if (!isValidDateInput(form.startDate) || !isValidDateInput(form.endDate)) return '日期格式不正确';
  if (form.endDate < form.startDate) return '结束日期不能早于开始日期';
  return '';
}

Page({
  data: {
    projectId: '', categories: [], users: [], selectedCategoryName: '', selectedRegistrantName: '',
    loading: true, ready: false, errorMessage: '',
    isLocked: false, isRedeemed: false, isCancelled: false, lockedMessage: '', saving: false, redeeming: false,
    form: emptyForm(), redeemForm: { redeemDate: '', actualInterest: '', actualFixedReward: '' }
  },
  onLoad(options) {
    const projectId = options.id || '';
    this.setData({ projectId, loading: true, ready: false, errorMessage: '' });
    return ensureAllowedSession()
      .then((session) => Promise.all([
        listCategories(), listUsers(), projectId ? listProjects() : Promise.resolve({ projects: [] })
      ]).then((results) => ({ session, results })))
      .then(({ session, results: [{ categories }, { users }, { projects }] }) => {
        const project = projects.find((item) => item._id === projectId);
        if (projectId && !project) throw new Error('PROJECT_NOT_FOUND');
        const selectableUsers = users.map((user) => ({
          ...user,
          displayName: user.nickname || (user.openid === session.openid ? '我' : '家庭成员')
        }));
        const registrantOpenid = project ? project.registrantOpenid : session.openid;
        const selectedCategory = project && categories.find((item) => item._id === project.categoryId);
        const selectedRegistrant = selectableUsers.find((item) => item.openid === registrantOpenid);
        const isRedeemed = Boolean(project && project.manualStatus === 'redeemed');
        const isCancelled = Boolean(project && project.manualStatus === 'cancelled');
        this.setData({
          loading: false, ready: true, categories, users: selectableUsers,
          selectedCategoryName: selectedCategory ? selectedCategory.name : '',
          selectedRegistrantName: selectedRegistrant ? selectedRegistrant.displayName : '',
          isLocked: isRedeemed || isCancelled, isRedeemed, isCancelled,
          lockedMessage: isCancelled ? '此项目已取消，记录不可再编辑。' : '基础信息已锁定，可在下方更正到账记录。',
          form: project ? {
            name: project.name, categoryId: project.categoryId, registrantOpenid: project.registrantOpenid,
            principal: String(project.principal), startDate: project.startDate, endDate: project.endDate,
            expectedAnnualRate: String(project.expectedAnnualRate || ''),
            fixedReward: String(project.fixedReward || ''), remark: project.remark || ''
          } : { ...emptyForm(), registrantOpenid: session.openid },
          redeemForm: project && project.manualStatus === 'redeemed' ? {
            redeemDate: project.redeemDate, actualInterest: String(project.actualInterest || ''), actualFixedReward: String(project.actualFixedReward || '')
          } : this.data.redeemForm
        });
      })
      .catch(() => this.setData({
        loading: false,
        ready: false,
        errorMessage: '项目加载失败，请稍后重试'
      }));
  },
  onInput(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  onRedeemInput(event) { this.setData({ [`redeemForm.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  onCategoryChange(event) {
    const category = this.data.categories[Number(event.detail.value)];
    this.setData({ selectedCategoryName: category.name, 'form.categoryId': category._id });
  },
  onRegistrantChange(event) {
    const user = this.data.users[Number(event.detail.value)];
    this.setData({ selectedRegistrantName: user.displayName, 'form.registrantOpenid': user.openid });
  },
  save() {
    if (!this.data.ready || this.data.loading || this.data.saving || this.data.redeeming) return;
    const form = this.data.form;
    const error = validateForm(form);
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    const principal = Number(form.principal);
    const expectedAnnualRate = Number(form.expectedAnnualRate || 0);
    const holdingDays = daysInclusive(form.startDate, form.endDate);
    const project = {
      ...form, principal, expectedAnnualRate, fixedReward: Number(form.fixedReward || 0),
      expectedInterest: calcExpectedInterest(principal, expectedAnnualRate, holdingDays)
    };
    this.setData({ saving: true });
    const request = this.data.projectId ? updateProject(this.data.projectId, project) : createProject(project);
    request.then(() => wx.navigateBack()).catch(showError).finally(() => this.setData({ saving: false }));
  },
  redeem() {
    if (!this.data.ready || this.data.loading || !this.data.projectId || this.data.saving || this.data.redeeming) return;
    this.setData({ redeeming: true });
    const request = this.data.isRedeemed ? correctRedemption : redeemProject;
    request(this.data.projectId, {
      ...this.data.redeemForm,
      actualInterest: Number(this.data.redeemForm.actualInterest || 0),
      actualFixedReward: Number(this.data.redeemForm.actualFixedReward || 0)
    }).then(() => wx.navigateBack()).catch(showError).finally(() => this.setData({ redeeming: false }));
  }
});
