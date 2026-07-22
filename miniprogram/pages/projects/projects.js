const { ensureAllowedSession } = require('../../services/session');
const { listProjects } = require('../../services/cloud');
const { daysInclusive } = require('../../utils/date');
const { calcActualTotalReturn, calcActualAnnualRate } = require('../../utils/finance');

function money(value) { return `¥${Number(value || 0).toFixed(2)}`; }

function mapProject(project) {
  const holdingDays = project.redeemDate ? daysInclusive(project.startDate, project.redeemDate) : 0;
  const actualTotal = calcActualTotalReturn(project.actualInterest, project.actualFixedReward);
  return {
    ...project,
    principalText: money(project.principal),
    dateRange: `${project.startDate} 至 ${project.endDate}`,
    expectedTotalText: money(Number(project.expectedInterest || 0) + Number(project.fixedReward || 0)),
    actualAnnualRateText: holdingDays ? `${(calcActualAnnualRate(actualTotal, project.principal, holdingDays) * 100).toFixed(2)}%` : '-',
    displayStatus: project.manualStatus === 'redeemed' ? '已到账' : project.manualStatus === 'cancelled' ? '已取消' : '未到账'
  };
}

Page({
  data: { loading: true, projects: [] },
  onShow() {
    this.setData({ loading: true });
    ensureAllowedSession()
      .then(() => listProjects())
      .then(({ projects }) => this.setData({ loading: false, projects: projects.map(mapProject) }))
      .catch(() => this.setData({ loading: false }));
  },
  goCreate() { wx.navigateTo({ url: '/pages/project-form/project-form' }); },
  openProject(event) { wx.navigateTo({ url: `/pages/project-form/project-form?id=${event.detail.id}` }); }
});
