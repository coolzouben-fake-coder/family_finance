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

Page({
  data: {
    loading: true,
    errorMessage: '',
    totalAssetsValue: 0,
    editingAssets: false,
    savingAssets: false,
    assetAmountInput: '',
    assetReasonInput: '',
    metrics: {
      totalAssets: '¥0.00',
      investedAmount: '¥0.00',
      idleAmount: '¥0.00',
      utilizationRate: '0.0%'
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
    this.setData({ loading: true, errorMessage: '' });
    ensureAllowedSession()
      .then(() => Promise.all([getAssets(), listProjects()]))
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
          totalAssetsValue: summary.totalAssets,
          metrics: {
            totalAssets: money(summary.totalAssets),
            investedAmount: money(summary.investedAmount),
            idleAmount: money(summary.idleAmount),
            utilizationRate: percent(summary.utilizationRate)
          },
          dueSoonProjects: decorated.filter((project) => project.dateStatus === 'due_soon'),
          overdueProjects: decorated.filter((project) => project.dateStatus === 'overdue_pending')
        });
      })
      .catch(() => {
        this.setData({ loading: false, errorMessage: '资金看板加载失败，请稍后重试' });
      });
  },

  startAssetEdit() {
    this.setData({
      editingAssets: true,
      assetAmountInput: String(this.data.totalAssetsValue),
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

  saveAssets() {
    const amount = Number(this.data.assetAmountInput);
    const reason = this.data.assetReasonInput.trim();
    if (!Number.isFinite(amount) || amount < 0) {
      wx.showToast({ title: '家庭总资产不能小于 0', icon: 'none' });
      return;
    }
    if (!reason) {
      wx.showToast({ title: '请填写调整原因', icon: 'none' });
      return;
    }

    this.setData({ savingAssets: true });
    return updateAssets(amount, reason)
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
