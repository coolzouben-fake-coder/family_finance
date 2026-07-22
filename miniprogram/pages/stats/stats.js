const { ensureAllowedSession } = require('../../services/session');
const { getAnnualStats } = require('../../services/cloud');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

Page({
  data: {
    year: new Date().getFullYear(),
    totalReturn: '¥0.00',
    annualizedRate: '0.00%',
    fixedRewardShare: '0.00%',
    monthly: [],
    byRegistrant: []
  },

  onLoad() {
    ensureAllowedSession().then(() => this.loadStats());
  },

  loadStats() {
    getAnnualStats(this.data.year).then(({ stats }) => {
      this.setData({
        totalReturn: money(stats.totalReturn),
        annualizedRate: percent(stats.annualizedRate),
        fixedRewardShare: percent(stats.fixedRewardShare),
        monthly: stats.monthly.map((item) => ({ ...item, amountText: money(item.amount) })),
        byRegistrant: stats.byRegistrant.map((item) => ({
          ...item,
          actualTotalReturnText: money(item.actualTotalReturn)
        }))
      });
    });
  }
});
