const { ensureAllowedSession } = require('../../services/session');
const { getAnnualStats, listCategories, listUsers, listProjects } = require('../../services/cloud');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function currentYearText() {
  return String(new Date().getFullYear());
}

Page({
  data: {
    year: currentYearText(),
    currentYear: currentYearText(),
    startYear: currentYearText(),
    loading: true,
    errorMessage: '',
    totalReturn: '¥0.00',
    annualizedRate: '0.00%',
    familyAssetReturnRate: '0.00%',
    averageFamilyAssets: '¥0.00',
    fixedRewardShare: '0.00%',
    returnBreakdown: [],
    monthly: [],
    byCategory: [],
    byRegistrant: []
  },

  onLoad() {
    ensureAllowedSession()
      .then(() => this.loadYearBounds())
      .then(() => this.loadStats())
      .catch(() => this.setData({ loading: false, errorMessage: '收益统计加载失败，请稍后重试' }));
  },

  loadYearBounds() {
    return listProjects().then(({ projects }) => {
      const years = (projects || [])
        .map((project) => project.startDate && project.startDate.slice(0, 4))
        .filter(Boolean);
      const earliestYear = years.length ? years.sort()[0] : this.data.currentYear;
      this.setData({ startYear: earliestYear });
    });
  },

  onYearChange(event) {
    this.setData({ year: event.detail.value });
    return this.loadStats();
  },

  loadStats() {
    this.setData({ loading: true, errorMessage: '' });
    return Promise.all([getAnnualStats(Number(this.data.year)), listCategories(), listUsers()])
      .then(([{ stats }, { categories }, { users }]) => {
        this.setData({
          loading: false,
          totalReturn: money(stats.totalReturn),
          annualizedRate: percent(stats.annualizedRate),
          familyAssetReturnRate: percent(stats.familyAssetReturnRate),
          averageFamilyAssets: money(stats.averageFamilyAssets),
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
