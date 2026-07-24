const { ensureAllowedSession } = require('../../services/session');
const {
  createProject, updateProject, redeemProject, receiveReturnProject, receiveRewardProject, redeemPrincipalProject, correctRedemption, removeProject,
  listCategories, listProjects, listUsers
} = require('../../services/cloud');
const { daysInclusive } = require('../../utils/date');
const { calcExpectedInterest } = require('../../utils/finance');

function emptyForm() {
  return {
    name: '', categoryId: '', registrantOpenid: '', principal: '', startDate: '', endDate: '',
    expectedReturnMode: 'annualRate', expectedAnnualRate: '', expectedFixedReturn: '', fixedReward: '', remark: ''
  };
}

const START_DATE_PLACEHOLDER = '开始日期 YYYY-MM-DD';
const END_DATE_PLACEHOLDER = '结束日期 YYYY-MM-DD';
const REDEEM_DATE_PLACEHOLDER = '到账日期 YYYY-MM-DD';
const CATEGORY_PLACEHOLDER = '选择品类';
const REGISTRANT_PLACEHOLDER = '选择家庭成员';
const EXPECTED_RETURN_MODES = ['annualRate', 'fixedReturn'];

function showError(error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }

function leaveProjectForm() {
  const fallback = () => wx.switchTab && wx.switchTab({ url: '/pages/projects/projects' });
  try {
    wx.navigateBack({ fail: fallback });
  } catch (error) {
    fallback();
  }
}

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
  if (form.expectedReturnMode && !EXPECTED_RETURN_MODES.includes(form.expectedReturnMode)) return '请选择预期收益形式';
  return '';
}

function expectedReturnModeState(mode) {
  return {
    isAnnualRateMode: mode === 'annualRate',
    isFixedReturnMode: mode === 'fixedReturn',
    annualRateModeClass: mode === 'annualRate' ? 'return-mode-button--active' : '',
    fixedReturnModeClass: mode === 'fixedReturn' ? 'return-mode-button--active' : ''
  };
}

function principalStatusOf(project, isRedeemed) {
  return project.principalStatus || (isRedeemed ? 'released' : 'holding');
}

function rewardStatusOf(project, isRedeemed) {
  return project.rewardStatus || (isRedeemed || project.returnStatus === 'received' ? 'received' : 'pending');
}

function rewardDateOf(project) {
  return project.rewardReceivedDate || project.returnReceivedDate || project.redeemDate || '';
}

Page({
  data: {
    projectId: '', categories: [], users: [], selectedCategoryName: '', selectedRegistrantName: '',
    selectedCategoryDisplay: CATEGORY_PLACEHOLDER, selectedRegistrantDisplay: REGISTRANT_PLACEHOLDER,
    loading: true, ready: false, errorMessage: '',
    isLocked: false, isRedeemed: false, isCancelled: false,
    isPrincipalReleased: false, isRewardReceived: false, isReturnReceived: false, lockedMessage: '',
    saving: false, receivingReturn: false, redeeming: false, removing: false,
    canRemove: false,
    returnStatus: 'pending',
    isAnnualRateMode: true, isFixedReturnMode: false,
    annualRateModeClass: 'return-mode-button--active', fixedReturnModeClass: '',
    redeemTitle: '确认到账', redeemButtonText: '确认到账',
    startDateText: START_DATE_PLACEHOLDER, endDateText: END_DATE_PLACEHOLDER,
    redeemDateText: REDEEM_DATE_PLACEHOLDER,
    principalDateText: REDEEM_DATE_PLACEHOLDER, rewardDateText: REDEEM_DATE_PLACEHOLDER,
    form: emptyForm(),
    redeemForm: { redeemDate: '', actualInterest: '', actualFixedReward: '' },
    principalForm: { redeemDate: '', actualInterest: '' },
    rewardForm: { rewardReceivedDate: '', actualFixedReward: '' }
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
        const manualRedeemed = Boolean(project && project.manualStatus === 'redeemed');
        const isCancelled = Boolean(project && project.manualStatus === 'cancelled');
        const principalStatus = project ? principalStatusOf(project, manualRedeemed) : 'holding';
        const rewardStatus = project ? rewardStatusOf(project, manualRedeemed) : 'pending';
        const isPrincipalReleased = principalStatus === 'released';
        const isRewardReceived = rewardStatus === 'received';
        const isRedeemed = Boolean(project && isPrincipalReleased && isRewardReceived);
        const returnStatus = isRewardReceived ? 'received' : 'pending';
        const isReturnReceived = isRewardReceived;
        const expectedReturnMode = project && project.expectedReturnMode === 'fixedReturn' ? 'fixedReturn' : 'annualRate';
        const redeemDate = project && project.redeemDate ? project.redeemDate : '';
        const rewardReceivedDate = project ? rewardDateOf(project) : '';
        this.setData({
          loading: false, ready: true, categories, users: selectableUsers,
          selectedCategoryName: selectedCategory ? selectedCategory.name : '',
          selectedRegistrantName: selectedRegistrant ? selectedRegistrant.displayName : '',
          selectedCategoryDisplay: selectedCategory ? selectedCategory.name : CATEGORY_PLACEHOLDER,
          selectedRegistrantDisplay: selectedRegistrant ? selectedRegistrant.displayName : REGISTRANT_PLACEHOLDER,
          isLocked: Boolean(project), isRedeemed, isCancelled,
          isPrincipalReleased, isRewardReceived, isReturnReceived, returnStatus,
          canRemove: Boolean(project && !isRedeemed),
          ...expectedReturnModeState(expectedReturnMode),
          redeemTitle: isRedeemed ? '更正到账记录' : '确认到账',
          redeemButtonText: isRedeemed ? '保存更正' : '确认到账',
          lockedMessage: isCancelled ? '此项目已取消，记录不可再编辑。' : '项目创建后基础信息不可编辑，可确认到账或删除项目。',
          startDateText: project && project.startDate ? project.startDate : START_DATE_PLACEHOLDER,
          endDateText: project && project.endDate ? project.endDate : END_DATE_PLACEHOLDER,
          redeemDateText: redeemDate || REDEEM_DATE_PLACEHOLDER,
          principalDateText: redeemDate || REDEEM_DATE_PLACEHOLDER,
          rewardDateText: rewardReceivedDate || REDEEM_DATE_PLACEHOLDER,
          form: project ? {
            name: project.name, categoryId: project.categoryId, registrantOpenid: project.registrantOpenid,
            principal: String(project.principal), startDate: project.startDate, endDate: project.endDate,
            expectedReturnMode,
            expectedAnnualRate: String(project.expectedAnnualRate || ''),
            expectedFixedReturn: String(project.expectedFixedReturn || project.expectedInterest || ''),
            fixedReward: String(project.fixedReward || ''), remark: project.remark || ''
          } : { ...emptyForm(), registrantOpenid: session.openid },
          redeemForm: project && (isPrincipalReleased || isRewardReceived) ? {
            redeemDate,
            actualInterest: String(project.actualInterest || ''),
            actualFixedReward: String(project.actualFixedReward || '')
          } : this.data.redeemForm,
          principalForm: project ? {
            redeemDate,
            actualInterest: String(project.actualInterest || '')
          } : this.data.principalForm,
          rewardForm: project ? {
            rewardReceivedDate,
            actualFixedReward: String(project.actualFixedReward || '')
          } : this.data.rewardForm
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
  onPrincipalInput(event) { this.setData({ [`principalForm.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  onRewardInput(event) { this.setData({ [`rewardForm.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  onStartDateChange(event) { this.setData({ 'form.startDate': event.detail.value, startDateText: event.detail.value }); },
  onEndDateChange(event) { this.setData({ 'form.endDate': event.detail.value, endDateText: event.detail.value }); },
  onRedeemDateChange(event) { this.setData({ 'redeemForm.redeemDate': event.detail.value, redeemDateText: event.detail.value }); },
  onPrincipalDateChange(event) {
    this.setData({ 'principalForm.redeemDate': event.detail.value, principalDateText: event.detail.value });
  },
  onRewardDateChange(event) {
    this.setData({ 'rewardForm.rewardReceivedDate': event.detail.value, rewardDateText: event.detail.value });
  },
  onCategoryChange(event) {
    const category = this.data.categories[Number(event.detail.value)];
    this.setData({ selectedCategoryName: category.name, selectedCategoryDisplay: category.name, 'form.categoryId': category._id });
  },
  onRegistrantChange(event) {
    const user = this.data.users[Number(event.detail.value)];
    this.setData({ selectedRegistrantName: user.displayName, selectedRegistrantDisplay: user.displayName, 'form.registrantOpenid': user.openid });
  },
  onExpectedReturnModeChange(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!EXPECTED_RETURN_MODES.includes(mode) || this.data.isLocked) return;
    this.setData({
      'form.expectedReturnMode': mode,
      'form.expectedAnnualRate': mode === 'annualRate' ? this.data.form.expectedAnnualRate : '',
      'form.expectedFixedReturn': mode === 'fixedReturn' ? this.data.form.expectedFixedReturn : '',
      ...expectedReturnModeState(mode)
    });
  },
  save() {
    if (!this.data.ready || this.data.loading || this.data.isLocked
      || this.data.saving || this.data.receivingReturn || this.data.redeeming || this.data.removing) return;
    const form = this.data.form;
    const error = validateForm(form);
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    const principal = Number(form.principal);
    const expectedReturnMode = form.expectedReturnMode || 'annualRate';
    const expectedAnnualRate = expectedReturnMode === 'annualRate' ? Number(form.expectedAnnualRate || 0) : 0;
    const expectedFixedReturn = expectedReturnMode === 'fixedReturn' ? Number(form.expectedFixedReturn || 0) : 0;
    const holdingDays = daysInclusive(form.startDate, form.endDate);
    const project = {
      ...form, expectedReturnMode, principal, expectedAnnualRate, fixedReward: Number(form.fixedReward || 0),
      expectedFixedReturn,
      expectedInterest: expectedReturnMode === 'fixedReturn'
        ? expectedFixedReturn
        : calcExpectedInterest(principal, expectedAnnualRate, holdingDays)
    };
    this.setData({ saving: true });
    const request = this.data.projectId ? updateProject(this.data.projectId, project) : createProject(project);
    request.then(leaveProjectForm).catch(showError).finally(() => this.setData({ saving: false }));
  },
  redeem() {
    if (!this.data.ready || this.data.loading || !this.data.projectId
      || this.data.saving || this.data.receivingReturn || this.data.redeeming || this.data.removing) return;
    this.setData({ redeeming: true });
    const request = this.data.isRedeemed ? correctRedemption : redeemProject;
    request(this.data.projectId, {
      redeemDate: this.data.principalForm.redeemDate || this.data.redeemForm.redeemDate,
      actualInterest: Number(this.data.principalForm.actualInterest || this.data.redeemForm.actualInterest || 0),
      rewardReceivedDate: this.data.rewardForm.rewardReceivedDate || this.data.redeemForm.redeemDate,
      actualFixedReward: Number(this.data.rewardForm.actualFixedReward || this.data.redeemForm.actualFixedReward || 0)
    }).then(leaveProjectForm).catch(showError).finally(() => this.setData({ redeeming: false }));
  },
  receiveReturn() {
    if (!this.data.ready || this.data.loading || !this.data.projectId || this.data.isRedeemed || this.data.isReturnReceived
      || this.data.saving || this.data.receivingReturn || this.data.redeeming || this.data.removing) return;
    this.setData({ receivingReturn: true });
    receiveReturnProject(this.data.projectId, {
      returnReceivedDate: this.data.redeemForm.redeemDate,
      actualInterest: Number(this.data.redeemForm.actualInterest || 0),
      actualFixedReward: Number(this.data.redeemForm.actualFixedReward || 0)
    }).then(leaveProjectForm).catch(showError).finally(() => this.setData({ receivingReturn: false }));
  },
  receiveReward() {
    if (!this.data.ready || this.data.loading || !this.data.projectId || this.data.isRedeemed || this.data.isRewardReceived
      || this.data.saving || this.data.receivingReturn || this.data.redeeming || this.data.removing) return;
    this.setData({ receivingReturn: true });
    receiveRewardProject(this.data.projectId, {
      rewardReceivedDate: this.data.rewardForm.rewardReceivedDate,
      actualFixedReward: Number(this.data.rewardForm.actualFixedReward || 0)
    }).then(leaveProjectForm).catch(showError).finally(() => this.setData({ receivingReturn: false }));
  },
  redeemPrincipal() {
    if (!this.data.ready || this.data.loading || !this.data.projectId || this.data.isRedeemed || this.data.isPrincipalReleased
      || this.data.saving || this.data.receivingReturn || this.data.redeeming || this.data.removing) return;
    this.setData({ redeeming: true });
    redeemPrincipalProject(this.data.projectId, {
      redeemDate: this.data.principalForm.redeemDate || this.data.redeemForm.redeemDate,
      actualInterest: Number(this.data.principalForm.actualInterest || this.data.redeemForm.actualInterest || 0)
    }).then(leaveProjectForm).catch(showError).finally(() => this.setData({ redeeming: false }));
  },
  remove() {
    if (!this.data.ready || this.data.loading || !this.data.projectId || !this.data.canRemove
      || this.data.saving || this.data.receivingReturn || this.data.redeeming || this.data.removing) return;
    wx.showModal({
      title: '删除项目',
      content: '删除后本金和收益都会从统计中移除，是否继续？',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ removing: true });
        removeProject(this.data.projectId)
          .then(leaveProjectForm)
          .catch(showError)
          .finally(() => this.setData({ removing: false }));
      }
    });
  }
});
