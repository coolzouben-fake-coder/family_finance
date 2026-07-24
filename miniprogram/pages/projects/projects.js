const { ensureAllowedSession } = require('../../services/session');
const {
  listProjects, listCategories, listUsers, cancelProject: cancelProjectRequest, removeProject: removeProjectRequest
} = require('../../services/cloud');
const { daysInclusive, getDateStatus } = require('../../utils/date');
const { calcActualTotalReturn, calcActualAnnualRate } = require('../../utils/finance');

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '本金和奖励待到账', value: 'principal_reward_pending' },
  { label: '本金待到账', value: 'principal_pending' },
  { label: '奖励待到账', value: 'reward_pending' },
  { label: '已到账', value: 'redeemed' },
  { label: '已取消', value: 'cancelled' },
  { label: '未开始', value: 'not_started' }
];
const STATUS_LABELS = {
  principal_reward_pending: '本金和奖励待到账',
  principal_pending: '本金待到账',
  reward_pending: '奖励待到账',
  overdue_pending: '待确认',
  due_soon: '即将到期',
  active: '进行中',
  not_started: '未开始',
  redeemed: '已到账',
  cancelled: '已取消'
};
const STATUS_PRIORITY = {
  overdue_pending: 0, due_soon: 1, active: 2, not_started: 3,
  principal_pending: 4, reward_pending: 5, redeemed: 6, cancelled: 7
};

function todayText() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, '0')).join('-');
}

function money(value) { return `¥${Number(value || 0).toFixed(2)}`; }

function getPrincipalStatus(project) {
  return project.principalStatus || (project.manualStatus === 'redeemed' ? 'released' : 'holding');
}

function getRewardStatus(project) {
  return project.rewardStatus || (
    project.manualStatus === 'redeemed' || project.returnStatus === 'received' ? 'received' : 'pending'
  );
}

function getDisplayStatus(project, dateStatus) {
  if (project.manualStatus === 'cancelled') return STATUS_LABELS.cancelled;
  const principalStatus = getPrincipalStatus(project);
  const rewardStatus = getRewardStatus(project);
  if (principalStatus === 'released' && rewardStatus === 'received') return STATUS_LABELS.redeemed;
  if (principalStatus === 'released') return STATUS_LABELS.reward_pending;
  if (rewardStatus === 'received') return STATUS_LABELS.principal_pending;
  return STATUS_LABELS.principal_reward_pending || STATUS_LABELS[dateStatus];
}

function getFilterStatus(project, dateStatus) {
  if (dateStatus === 'not_started') return 'not_started';
  if (project.manualStatus === 'cancelled') return 'cancelled';
  const principalStatus = getPrincipalStatus(project);
  const rewardStatus = getRewardStatus(project);
  if (principalStatus === 'released' && rewardStatus === 'received') return 'redeemed';
  if (principalStatus === 'released') return 'reward_pending';
  if (rewardStatus === 'received') return 'principal_pending';
  return 'principal_reward_pending';
}

function mapProject(project, categories, users, today) {
  const principalStatus = getPrincipalStatus(project);
  const rewardStatus = getRewardStatus(project);
  const isPrincipalReleased = principalStatus === 'released';
  const isRewardReceived = rewardStatus === 'received';
  const holdingDays = isPrincipalReleased && project.redeemDate ? daysInclusive(project.startDate, project.redeemDate) : 0;
  const actualTotal = calcActualTotalReturn(project.actualInterest, project.actualFixedReward);
  const dateStatus = getDateStatus(project, today, 3);
  const category = categories.find((item) => item._id === project.categoryId);
  const registrant = users.find((item) => item.openid === project.registrantOpenid);
  return {
    ...project,
    dateStatus,
    projectYear: project.startDate.slice(0, 4),
    categoryName: category ? category.name : '未分类',
    registrantName: registrant ? (registrant.nickname || '家庭成员') : '家庭成员',
    principalText: money(project.principal),
    dateRange: `${project.startDate} 至 ${project.endDate}`,
    expectedTotalText: money(Number(project.expectedInterest || 0) + Number(project.fixedReward || 0)),
    actualTotalText: isPrincipalReleased || isRewardReceived ? money(actualTotal) : '-',
    actualAnnualRateText: holdingDays
      ? `${(calcActualAnnualRate(actualTotal, project.principal, holdingDays) * 100).toFixed(2)}%`
      : '-',
    canCancel: project.manualStatus === 'active' && !isPrincipalReleased,
    canRemove: !(isPrincipalReleased && isRewardReceived),
    displayStatus: getDisplayStatus(project, dateStatus),
    filterStatus: getFilterStatus(project, dateStatus)
  };
}

function sortProjects(left, right) {
  const priority = STATUS_PRIORITY[left.dateStatus] - STATUS_PRIORITY[right.dateStatus];
  if (priority !== 0) return priority;
  if (left.dateStatus === 'active' || left.dateStatus === 'principal_pending') return left.endDate.localeCompare(right.endDate);
  return right.endDate.localeCompare(left.endDate);
}

function confirmAndRun(page, options) {
  wx.showModal({
    title: options.title,
    content: options.content,
    confirmText: options.confirmText,
    confirmColor: options.confirmColor,
    success(result) {
      if (!result.confirm) return;
      options.request().then(() => {
        wx.showToast({ title: options.successText, icon: 'success' });
        page.loadProjects();
      }).catch(() => wx.showToast({ title: options.errorText, icon: 'none' }));
    }
  });
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    rawProjects: [],
    projects: [],
    statusOptions: STATUS_OPTIONS,
    categoryOptions: [{ _id: '', name: '全部品类' }],
    registrantOptions: [{ openid: '', nickname: '全部登记人' }],
    yearOptions: ['全部年份'],
    selectedStatusLabel: '全部状态',
    selectedCategoryLabel: '全部品类',
    selectedRegistrantLabel: '全部登记人',
    selectedYearLabel: '全部年份',
    filters: { status: '', categoryId: '', registrantOpenid: '', year: '' }
  },

  onShow() { this.loadProjects(); },

  loadProjects() {
    this.setData({ loading: true, errorMessage: '' });
    return ensureAllowedSession()
      .then(() => Promise.all([listProjects(), listCategories(), listUsers()]))
      .then(([{ projects }, { categories }, { users }]) => {
        const rawProjects = projects.map((project) => mapProject(project, categories, users, todayText()));
        const years = [...new Set(rawProjects.map((project) => project.projectYear))]
          .sort((left, right) => right.localeCompare(left));
        this.setData({
          loading: false,
          rawProjects,
          categoryOptions: [{ _id: '', name: '全部品类' }, ...categories],
          registrantOptions: [{ openid: '', nickname: '全部登记人' }, ...users],
          yearOptions: ['全部年份', ...years]
        });
        this.applyFilters();
      })
      .catch(() => this.setData({ loading: false, errorMessage: '项目加载失败，请稍后重试', projects: [] }));
  },

  applyFilters() {
    const filters = this.data.filters;
    const projects = this.data.rawProjects.filter((project) => (
      (!filters.status || project.filterStatus === filters.status)
      && (!filters.categoryId || project.categoryId === filters.categoryId)
      && (!filters.registrantOpenid || project.registrantOpenid === filters.registrantOpenid)
      && (!filters.year || project.projectYear === filters.year)
    )).sort(sortProjects);
    this.setData({ projects });
  },

  onStatusChange(event) {
    const option = this.data.statusOptions[Number(event.detail.value)];
    this.setData({ filters: { ...this.data.filters, status: option.value }, selectedStatusLabel: option.label });
    this.applyFilters();
  },

  onCategoryChange(event) {
    const option = this.data.categoryOptions[Number(event.detail.value)];
    this.setData({ filters: { ...this.data.filters, categoryId: option._id }, selectedCategoryLabel: option.name });
    this.applyFilters();
  },

  onRegistrantChange(event) {
    const option = this.data.registrantOptions[Number(event.detail.value)];
    this.setData({
      filters: { ...this.data.filters, registrantOpenid: option.openid },
      selectedRegistrantLabel: option.nickname || '家庭成员'
    });
    this.applyFilters();
  },

  onYearChange(event) {
    const option = this.data.yearOptions[Number(event.detail.value)];
    const year = option === '全部年份' ? '' : option;
    this.setData({ filters: { ...this.data.filters, year }, selectedYearLabel: option });
    this.applyFilters();
  },

  goCreate() { wx.navigateTo({ url: '/pages/project-form/project-form' }); },
  openProject(event) { wx.navigateTo({ url: `/pages/project-form/project-form?id=${event.detail.id}` }); },

  cancelProject(event) {
    const id = event.detail.id;
    confirmAndRun(this, {
      title: '取消项目', content: '取消后不再占用家庭资金，是否继续？', confirmText: '确认取消',
      confirmColor: '#FF9500', request: () => cancelProjectRequest(id), successText: '项目已取消', errorText: '取消失败'
    });
  },

  removeProject(event) {
    const id = event.detail.id;
    const project = this.data.projects.find((item) => item._id === id);
    if (project && !project.canRemove) {
      wx.showToast({ title: '已到账项目不可删除', icon: 'none' });
      return;
    }
    confirmAndRun(this, {
      title: '删除项目', content: '删除后无法恢复，是否继续？', confirmText: '删除', confirmColor: '#FF3B30',
      request: () => removeProjectRequest(id), successText: '项目已删除', errorText: '删除失败'
    });
  }
});
