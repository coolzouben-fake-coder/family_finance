const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_ENABLED_USERS = 2;
const PROJECT_QUERY_BATCH_SIZE = 20;

function daysInclusive(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function actualTotal(project) {
  return Number(project.actualInterest || 0) + Number(project.actualFixedReward || 0);
}

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ enabled: true }).get();
  if (result.data.length > MAX_ENABLED_USERS) throw new Error('AUTH_CONFIG_INVALID');
  if (!result.data.some((user) => user.openid === openid)) throw new Error('AUTH_DENIED');
}

async function listRedeemedProjects(start, end) {
  const projects = [];
  let offset = 0;

  while (true) {
    const result = await db.collection('projects')
      .where({
        manualStatus: 'redeemed',
        redeemDate: db.command.gte(start).and(db.command.lte(end))
      })
      .skip(offset)
      .limit(PROJECT_QUERY_BATCH_SIZE)
      .get();
    projects.push(...result.data);
    if (result.data.length < PROJECT_QUERY_BATCH_SIZE) return projects;
    offset += result.data.length;
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  await requireAllowed(wxContext.OPENID);
  if (event.action !== 'annual') throw new Error('UNKNOWN_ACTION');

  const year = Number(event.year);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const projects = await listRedeemedProjects(start, end);

  const monthly = {};
  const byCategory = {};
  const byRegistrant = {};
  let totalReturn = 0;
  let totalFixedReward = 0;
  let weightedPrincipalDays = 0;

  projects.forEach((project) => {
    const month = project.redeemDate.slice(0, 7);
    const projectReturn = actualTotal(project);
    const holdingDays = daysInclusive(project.startDate, project.redeemDate);

    monthly[month] = (monthly[month] || 0) + projectReturn;
    byCategory[project.categoryId] = byCategory[project.categoryId] || {
      categoryId: project.categoryId,
      projectCount: 0,
      principal: 0,
      actualTotalReturn: 0
    };
    byCategory[project.categoryId].projectCount += 1;
    byCategory[project.categoryId].principal += Number(project.principal || 0);
    byCategory[project.categoryId].actualTotalReturn += projectReturn;
    byRegistrant[project.registrantOpenid] = byRegistrant[project.registrantOpenid] || {
      registrantOpenid: project.registrantOpenid,
      projectCount: 0,
      principal: 0,
      actualTotalReturn: 0,
      weightedPrincipalDays: 0
    };
    byRegistrant[project.registrantOpenid].projectCount += 1;
    byRegistrant[project.registrantOpenid].principal += Number(project.principal || 0);
    byRegistrant[project.registrantOpenid].actualTotalReturn += projectReturn;
    byRegistrant[project.registrantOpenid].weightedPrincipalDays += Number(project.principal || 0) * holdingDays;

    totalReturn += projectReturn;
    totalFixedReward += Number(project.actualFixedReward || 0);
    weightedPrincipalDays += Number(project.principal || 0) * holdingDays;
  });

  return {
    ok: true,
    stats: {
      year,
      totalReturn,
      annualizedRate: weightedPrincipalDays > 0 ? totalReturn / weightedPrincipalDays * 365 : 0,
      fixedRewardShare: totalReturn !== 0 ? totalFixedReward / totalReturn : 0,
      monthly: Object.keys(monthly).sort().map((month) => ({ month, amount: monthly[month] })),
      byCategory: Object.keys(byCategory).map((categoryId) => byCategory[categoryId]),
      byRegistrant: Object.keys(byRegistrant).map((openid) => {
        const item = byRegistrant[openid];
        return {
          registrantOpenid: item.registrantOpenid,
          projectCount: item.projectCount,
          principal: item.principal,
          actualTotalReturn: item.actualTotalReturn,
          annualizedRate: item.weightedPrincipalDays > 0
            ? item.actualTotalReturn / item.weightedPrincipalDays * 365
            : 0
        };
      })
    }
  };
};
