const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_ENABLED_USERS = 2;
const PROJECT_QUERY_BATCH_SIZE = 20;
const ASSET_DOCUMENT_ID = 'current';

function daysInclusive(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseDate(dateText) {
  const [year, month, day] = dateText.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateText(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function actualTotal(project) {
  return Number(project.actualInterest || 0) + Number(project.actualFixedReward || 0);
}

function principalStatus(project) {
  if (project.principalStatus) return project.principalStatus;
  return project.manualStatus === 'redeemed' ? 'released' : 'holding';
}

function rewardStatus(project) {
  if (project.rewardStatus) return project.rewardStatus;
  return project.manualStatus === 'redeemed' || project.returnStatus === 'received' ? 'received' : 'pending';
}

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ enabled: true }).get();
  if (result.data.length > MAX_ENABLED_USERS) throw new Error('AUTH_CONFIG_INVALID');
  if (!result.data.some((user) => user.openid === openid)) throw new Error('AUTH_DENIED');
}

async function listProjects() {
  const projects = [];
  let offset = 0;

  while (true) {
    const result = await db.collection('projects')
      .where({})
      .skip(offset)
      .limit(PROJECT_QUERY_BATCH_SIZE)
      .get();
    projects.push(...result.data);
    if (result.data.length < PROJECT_QUERY_BATCH_SIZE) return projects;
    offset += result.data.length;
  }
}

async function listAssetChanges() {
  const changes = [];
  let offset = 0;

  while (true) {
    const result = await db.collection('asset_changes')
      .where({})
      .skip(offset)
      .limit(PROJECT_QUERY_BATCH_SIZE)
      .get();
    changes.push(...result.data);
    if (result.data.length < PROJECT_QUERY_BATCH_SIZE) {
      return changes.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    }
    offset += result.data.length;
  }
}

async function getCurrentFamilyAssets() {
  try {
    const result = await db.collection('family_assets').doc(ASSET_DOCUMENT_ID).get();
    return Number(result.data.totalAmount || 0);
  } catch (error) {
    return 0;
  }
}

function changeDate(change) {
  if (!change.createdAt) return '';
  if (typeof change.createdAt === 'string') return change.createdAt.slice(0, 10);
  if (change.createdAt instanceof Date) return dateText(change.createdAt);
  return String(change.createdAt).slice(0, 10);
}

async function averageFamilyAssets(year, start, end) {
  const changes = await listAssetChanges();
  const currentAssets = await getCurrentFamilyAssets();
  const beforeYear = changes.filter((change) => changeDate(change) < start);
  const inYear = changes.filter((change) => changeDate(change) >= start && changeDate(change) <= end);
  let amount = beforeYear.length
    ? Number(beforeYear[beforeYear.length - 1].afterAmount || 0)
    : (inYear.length ? Number(inYear[0].beforeAmount || 0) : currentAssets);
  let cursor = parseDate(start);
  const endDate = parseDate(end);
  let weightedAssets = 0;

  inYear.forEach((change) => {
    const effectiveDate = parseDate(changeDate(change));
    if (effectiveDate > cursor) {
      weightedAssets += amount * daysInclusive(dateText(cursor), dateText(addDays(effectiveDate, -1)));
    }
    amount = Number(change.afterAmount || 0);
    cursor = effectiveDate;
  });

  if (cursor <= endDate) {
    weightedAssets += amount * daysInclusive(dateText(cursor), end);
  }

  const yearDays = daysInclusive(`${year}-01-01`, `${year}-12-31`);
  return weightedAssets / yearDays;
}

function rewardReceivedDate(project) {
  return project.rewardReceivedDate || project.returnReceivedDate || project.redeemDate || '';
}

function cashflowEvents(project, start, end) {
  const events = [];
  if (principalStatus(project) === 'released' && project.redeemDate >= start && project.redeemDate <= end) {
    events.push({ date: project.redeemDate, interest: Number(project.actualInterest || 0), reward: 0 });
  }
  const rewardDate = rewardReceivedDate(project);
  if (rewardStatus(project) === 'received' && rewardDate >= start && rewardDate <= end) {
    events.push({ date: rewardDate, interest: 0, reward: Number(project.actualFixedReward || 0) });
  }
  return events;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  await requireAllowed(wxContext.OPENID);
  if (event.action !== 'annual') throw new Error('UNKNOWN_ACTION');

  const year = Number(event.year);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const projects = await listProjects();

  const monthly = {};
  const byCategory = {};
  const byRegistrant = {};
  let totalReturn = 0;
  let totalInterest = 0;
  let totalFixedReward = 0;
  let annualizedReturn = 0;
  let weightedPrincipalDays = 0;

  projects.forEach((project) => {
    const events = cashflowEvents(project, start, end);
    if (events.length === 0) return;
    const projectReturn = events.reduce((sum, event) => sum + event.interest + event.reward, 0);
    const projectInterest = events.reduce((sum, event) => sum + event.interest, 0);
    const projectReward = events.reduce((sum, event) => sum + event.reward, 0);
    const holdingDays = principalStatus(project) === 'released' && project.redeemDate
      ? daysInclusive(project.startDate, project.redeemDate)
      : 0;

    events.forEach((event) => {
      const month = event.date.slice(0, 7);
      monthly[month] = (monthly[month] || 0) + event.interest + event.reward;
    });
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
      annualizedReturn: 0,
      weightedPrincipalDays: 0
    };
    byRegistrant[project.registrantOpenid].projectCount += 1;
    byRegistrant[project.registrantOpenid].principal += Number(project.principal || 0);
    byRegistrant[project.registrantOpenid].actualTotalReturn += projectReturn;

    totalReturn += projectReturn;
    totalInterest += projectInterest;
    totalFixedReward += projectReward;
    if (holdingDays > 0) {
      annualizedReturn += projectReturn;
      weightedPrincipalDays += Number(project.principal || 0) * holdingDays;
      byRegistrant[project.registrantOpenid].annualizedReturn += projectReturn;
      byRegistrant[project.registrantOpenid].weightedPrincipalDays += Number(project.principal || 0) * holdingDays;
    }
  });

  const averageAssets = await averageFamilyAssets(year, start, end);

  return {
    ok: true,
    stats: {
      year,
      totalReturn,
      actualInterestTotal: totalInterest,
      actualFixedRewardTotal: totalFixedReward,
      annualizedRate: weightedPrincipalDays > 0 ? annualizedReturn / weightedPrincipalDays * 365 : 0,
      averageFamilyAssets: averageAssets,
      familyAssetReturnRate: averageAssets > 0 ? totalReturn / averageAssets : 0,
      interestShare: totalReturn !== 0 ? totalInterest / totalReturn : 0,
      fixedRewardShare: totalReturn !== 0 ? totalFixedReward / totalReturn : 0,
      monthly: Object.keys(monthly).sort().map((month) => ({ month, amount: monthly[month] })),
      byCategory: Object.keys(byCategory).map((categoryId) => ({
        ...byCategory[categoryId],
        share: totalReturn !== 0 ? byCategory[categoryId].actualTotalReturn / totalReturn : 0
      })),
      byRegistrant: Object.keys(byRegistrant).map((openid) => {
        const item = byRegistrant[openid];
        return {
          registrantOpenid: item.registrantOpenid,
          projectCount: item.projectCount,
          principal: item.principal,
          actualTotalReturn: item.actualTotalReturn,
          annualizedRate: item.weightedPrincipalDays > 0
            ? item.annualizedReturn / item.weightedPrincipalDays * 365
            : 0
        };
      })
    }
  };
};
