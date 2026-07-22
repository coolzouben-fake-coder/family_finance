const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_ENABLED_USERS = 2;
const PROJECT_QUERY_BATCH_SIZE = 20;

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function numberInRange(value, errorCode, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(errorCode);
  return number;
}

function optionalMoney(value, errorCode) {
  return numberInRange(value === undefined || value === '' ? 0 : value, errorCode, 0, 1000000000000);
}

function optionalActualReturn(value, errorCode) {
  return numberInRange(value === undefined || value === '' ? 0 : value, errorCode, -1000000000000, 1000000000000);
}

function calculateExpectedInterest(principal, annualRate, startDate, endDate) {
  const holdingDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  return Math.round(principal * annualRate * holdingDays / 365 * 100) / 100;
}

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ enabled: true }).get();
  if (result.data.length > MAX_ENABLED_USERS) throw new Error('AUTH_CONFIG_INVALID');
  if (!result.data.some((user) => user.openid === openid)) throw new Error('AUTH_DENIED');
}

async function requireEnabledCategory(categoryId) {
  const result = await db.collection('categories').where({ _id: categoryId, enabled: true }).limit(1).get();
  if (result.data.length === 0) throw new Error('CATEGORY_INVALID');
}

function validateBaseProject(data) {
  if (!data || typeof data !== 'object') throw new Error('PROJECT_INVALID');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100) throw new Error('NAME_REQUIRED');
  if (typeof data.categoryId !== 'string' || !data.categoryId) throw new Error('CATEGORY_REQUIRED');
  const principal = numberInRange(data.principal, 'PRINCIPAL_INVALID', 0.01, 1000000000000);
  if (!isValidDate(data.startDate) || !isValidDate(data.endDate)) throw new Error('DATE_REQUIRED');
  if (data.endDate < data.startDate) throw new Error('END_DATE_INVALID');
  const expectedAnnualRate = numberInRange(data.expectedAnnualRate === undefined || data.expectedAnnualRate === '' ? 0 : data.expectedAnnualRate, 'EXPECTED_ANNUAL_RATE_INVALID', 0, 1);
  const fixedReward = optionalMoney(data.fixedReward, 'FIXED_REWARD_INVALID');
  if (data.remark !== undefined && (typeof data.remark !== 'string' || data.remark.length > 1000)) throw new Error('REMARK_INVALID');
  return {
    name: data.name.trim(), categoryId: data.categoryId, principal, startDate: data.startDate, endDate: data.endDate,
    expectedAnnualRate, fixedReward, remark: data.remark || ''
  };
}

async function getProject(id) {
  if (typeof id !== 'string' || !id) throw new Error('PROJECT_ID_REQUIRED');
  try {
    return (await db.collection('projects').doc(id).get()).data;
  } catch (error) {
    if (error && error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') throw new Error('PROJECT_NOT_FOUND');
    throw error;
  }
}

async function listProjects(event) {
  const query = {};
  if (['active', 'redeemed', 'cancelled'].includes(event.manualStatus)) query.manualStatus = event.manualStatus;
  if (typeof event.categoryId === 'string' && event.categoryId) query.categoryId = event.categoryId;
  if (typeof event.registrantOpenid === 'string' && event.registrantOpenid) query.registrantOpenid = event.registrantOpenid;

  const projects = [];
  let offset = 0;
  while (true) {
    const result = await db.collection('projects').where(query).orderBy('endDate', 'asc')
      .skip(offset).limit(PROJECT_QUERY_BATCH_SIZE).get();
    projects.push(...result.data);
    if (result.data.length < PROJECT_QUERY_BATCH_SIZE) return projects;
    offset += result.data.length;
  }
}

async function listCategories() {
  return (await db.collection('categories').where({ enabled: true }).orderBy('sortOrder', 'asc').get()).data;
}

async function createProject(openid, data) {
  const project = validateBaseProject(data);
  await requireEnabledCategory(project.categoryId);
  const now = db.serverDate();
  const payload = {
    ...project, registrantOpenid: openid,
    expectedInterest: calculateExpectedInterest(project.principal, project.expectedAnnualRate, project.startDate, project.endDate),
    actualInterest: 0, actualFixedReward: 0, redeemDate: '', manualStatus: 'active', createdAt: now, updatedAt: now
  };
  const result = await db.collection('projects').add({ data: payload });
  return { _id: result._id, ...payload };
}

async function updateProject(id, data) {
  const existing = await getProject(id);
  if (existing.manualStatus !== 'active') throw new Error('PROJECT_NOT_ACTIVE');
  const project = validateBaseProject(data);
  await requireEnabledCategory(project.categoryId);
  const payload = {
    ...project,
    expectedInterest: calculateExpectedInterest(project.principal, project.expectedAnnualRate, project.startDate, project.endDate),
    updatedAt: db.serverDate()
  };
  await db.collection('projects').doc(id).update({ data: payload });
  return { _id: id, ...existing, ...payload };
}

async function redeemProject(id, data) {
  const project = await getProject(id);
  if (project.manualStatus !== 'active') throw new Error('PROJECT_NOT_ACTIVE');
  if (!data || !isValidDate(data.redeemDate)) throw new Error('REDEEM_DATE_REQUIRED');
  if (data.redeemDate < project.startDate) throw new Error('REDEEM_DATE_INVALID');
  const payload = {
    actualInterest: optionalActualReturn(data.actualInterest, 'ACTUAL_INTEREST_INVALID'),
    actualFixedReward: optionalActualReturn(data.actualFixedReward, 'ACTUAL_FIXED_REWARD_INVALID'),
    redeemDate: data.redeemDate, manualStatus: 'redeemed', updatedAt: db.serverDate()
  };
  await db.collection('projects').doc(id).update({ data: payload });
  return { _id: id, ...project, ...payload };
}

async function cancelProject(id) {
  const project = await getProject(id);
  if (project.manualStatus !== 'active') throw new Error('PROJECT_NOT_ACTIVE');
  await db.collection('projects').doc(id).update({ data: { manualStatus: 'cancelled', updatedAt: db.serverDate() } });
}

async function removeProject(id) {
  await getProject(id);
  await db.collection('projects').doc(id).remove();
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  await requireAllowed(openid);
  if (event.action === 'list') return { ok: true, projects: await listProjects(event) };
  if (event.action === 'listCategories') return { ok: true, categories: await listCategories() };
  if (event.action === 'create') return { ok: true, project: await createProject(openid, event.project) };
  if (event.action === 'update') return { ok: true, project: await updateProject(event.id, event.project) };
  if (event.action === 'redeem') return { ok: true, project: await redeemProject(event.id, event.redeemData) };
  if (event.action === 'cancel') { await cancelProject(event.id); return { ok: true }; }
  if (event.action === 'remove') { await removeProject(event.id); return { ok: true }; }
  throw new Error('UNKNOWN_ACTION');
};
