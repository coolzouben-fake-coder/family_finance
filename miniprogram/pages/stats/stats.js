const { ensureAllowedSession } = require('../../services/session');
const { getAnnualStats, listCategories, listUsers } = require('../../services/cloud');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

Page({
  data: {
    year: new Date().getFullYear(),
    loading: true,
    errorMessage: '',
    totalReturn: '¥0.00',
    annualizedRate: '0.00%',
    fixedRewardShare: '0.00%',
    returnBreakdown: [],
    monthly: [],
    byCategory: [],
    byRegistrant: []
  },

  onLoad() {
    ensureAllowedSession()
      .then(() => this.loadStats())
      .catch(() => this.setData({ loading: false, errorMessage: '收益统计加载失败，请稍后重试' }));
  },

  onYearChange(event) {
    this.setData({ year: Number(event.detail.value) });
    return this.loadStats();
  },

  loadStats() {
    this.setData({ loading: true, errorMessage: '' });
    return Promise.all([getAnnualStats(this.data.year), listCategories(), listUsers()])
      .then(([{ stats }, { categories }, { users }]) => {
        this.setData({
          loading: false,
          totalReturn: money(stats.totalReturn),
          annualizedRate: percent(stats.annualizedRate),
          fixedRewardShare: percent(stats.fixedRewardShare),
          returnBreakdown: [
            {
              key: 'interest', label: '实际利息', amountText: money(stats.actualInterestTotal),
              shareText: percent(stats.interestShare)
            },
            {
              key: 'fixedReward', label: '实际固定奖励', amountText: money(stats.actualFixedRewardTotal),
              shareText: percent(stats.fixedRewardShare)
            }
          ],
          monthly: stats.monthly.map((item) => ({ ...item, amountText: money(item.amount) })),
          byCategory: stats.byCategory.map((item) => {
            const category = categories.find((candidate) => candidate._id === item.categoryId);
            return {
              ...item,
              categoryName: category ? category.name : '未分类',
              actualTotalReturnText: money(item.actualTotalReturn),
              shareText: percent(item.share)
            };
          }),
          byRegistrant: stats.byRegistrant.map((item) => {
            const user = users.find((candidate) => candidate.openid === item.registrantOpenid);
            return {
              ...item,
              registrantName: user ? (user.nickname || '家庭成员') : '家庭成员',
              actualTotalReturnText: money(item.actualTotalReturn),
              annualizedRateText: percent(item.annualizedRate)
            };
          })
        });
      })
      .catch(() => this.setData({ loading: false, errorMessage: '收益统计加载失败，请稍后重试' }));
  }
});
