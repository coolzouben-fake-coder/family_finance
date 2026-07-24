const { ensureAllowedSession } = require('../../services/session');
const { getAssets, listProjects, updateAssets } = require('../../services/cloud');
const { summarizeCapital } = require('../../utils/finance');
const { getDateStatus } = require('../../utils/date');

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function assetTypeClasses(type) {
  return {
    depositTypeClass: type === 'deposit' ? 'asset-type-button--active' : '',
    withdrawTypeClass: type === 'withdraw' ? 'asset-type-button--active' : ''
  };
}

Page({
  data: {
    loading: true,
    dashboardReady: false,
    errorMessage: '',
    totalAssetsValue: null,
    editingAssets: false,
    savingAssets: false,
    assetChangeType: 'deposit',
    depositTypeClass: 'asset-type-button--active',
    withdrawTypeClass: '',
    assetAmountInput: '',
    assetReasonInput: '',
    metrics: {
      totalAssets: '¥0.00',
      investedAmount: '¥0.00',
      idleAmount: '¥0.00',
      utilizationRate: '0.0%',
      inTransitReturn: '¥0.00',
      realizedReturn: '¥0.00'
    },
    dueSoonProjects: [],
    overdueProjects: []
  },

  onLoad() {
    this.loadDashboard();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadDashboard();
    }
  },

  loadDashboard() {
    this.setData({
      loading: true,
      dashboardReady: false,
      errorMessage: '',
      editingAssets: false,
      assetChangeType: 'deposit',
      ...assetTypeClasses('deposit'),
      assetAmountInput: '',
      assetReasonInput: ''
    });
    return ensureAllowedSession()
      .then(() => Promise.all([
        getAssets(),
        listProjects()
      ]))
      .then(([assetResult, projectResult]) => {
        const projects = projectResult.projects || [];
        const summary = summarizeCapital(assetResult.asset.totalAmount, projects);
        const today = todayText();
        const decorated = projects.map((project) => ({
          ...project,
          displayAmount: money(project.principal),
          dateStatus: getDateStatus(project, today, 3)
        }));

        this.setData({
          loading: false,
          dashboardReady: true,
          totalAssetsValue: summary.totalAssets,
          metrics: {
            totalAssets: money(summary.totalAssets),
            investedAmount: money(summary.investedAmount),
            idleAmount: money(summary.idleAmount),
            utilizationRate: percent(summary.utilizationRate),
            inTransitReturn: money(summary.inTransitReturn),
            realizedReturn: money(summary.realizedReturn)
          },
          dueSoonProjects: decorated.filter((project) => project.dateStatus === 'due_soon'),
          overdueProjects: decorated.filter((project) => project.dateStatus === 'overdue_pending')
        });
      })
      .catch(() => {
        this.setData({ loading: false, dashboardReady: false, errorMessage: '资金看板加载失败，请稍后重试' });
      });
  },

  startAssetEdit() {
    if (!this.data.dashboardReady || this.data.loading || this.data.savingAssets) return;
    this.setData({
      editingAssets: true,
      assetChangeType: 'deposit',
      ...assetTypeClasses('deposit'),
      assetAmountInput: '',
      assetReasonInput: ''
    });
  },

  cancelAssetEdit() {
    this.setData({ editingAssets: false, assetReasonInput: '' });
  },

  onAssetInput(event) {
    this.setData({ assetAmountInput: event.detail.value });
  },

  onAssetReasonInput(event) {
    this.setData({ assetReasonInput: event.detail.value });
  },

  onAssetTypeChange(event) {
    const type = event.currentTarget.dataset.type;
    if (type !== 'deposit' && type !== 'withdraw') return;
    this.setData({ assetChangeType: type, ...assetTypeClasses(type) });
  },

  openAssetChanges() {
    if (!this.data.dashboardReady) return;
    wx.navigateTo({ url: '/pages/asset-changes/asset-changes' });
  },

  saveAssets() {
    if (!this.data.dashboardReady || this.data.loading || this.data.savingAssets) return;
    const amount = Number(this.data.assetAmountInput);
    const reason = this.data.assetReasonInput.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      wx.showToast({ title: '调整金额必须大于 0', icon: 'none' });
      return;
    }
    if (!reason) {
      wx.showToast({ title: '请填写调整原因', icon: 'none' });
      return;
    }

    this.setData({ savingAssets: true });
    return updateAssets(this.data.assetChangeType, amount, reason)
      .then(() => {
        this.setData({ editingAssets: false, savingAssets: false });
        return this.loadDashboard();
      })
      .catch(() => {
        this.setData({ savingAssets: false });
        wx.showToast({ title: '家庭总资产更新失败', icon: 'none' });
      });
  }
});
