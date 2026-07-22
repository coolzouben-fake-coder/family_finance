const { ensureAllowedSession } = require('../../services/session');
const { getAssets } = require('../../services/cloud');
const { summarizeCapital } = require('../../utils/finance');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

Page({
  data: {
    loading: true,
    metrics: {
      totalAssets: '¥0.00',
      investedAmount: '¥0.00',
      idleAmount: '¥0.00',
      utilizationRate: '0.0%'
    }
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
    ensureAllowedSession()
      .then(() => getAssets())
      .then(({ asset }) => {
        const summary = summarizeCapital(asset.totalAmount, []);
        this.setData({
          loading: false,
          metrics: {
            totalAssets: money(summary.totalAssets),
            investedAmount: money(summary.investedAmount),
            idleAmount: money(summary.idleAmount),
            utilizationRate: percent(summary.utilizationRate)
          }
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  }
});
