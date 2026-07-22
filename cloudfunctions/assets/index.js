const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ASSET_DOCUMENT_ID = 'current';

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ enabled: true }).get();
  if (result.data.length > 2) {
    throw new Error('AUTH_CONFIG_INVALID');
  }
  if (!result.data.some((user) => user.openid === openid)) {
    throw new Error('AUTH_DENIED');
  }
}

function isMissingDocumentError(error) {
  return error && error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST';
}

function normalizeReason(reason) {
  if (typeof reason !== 'string') {
    throw new Error('ASSET_REASON_INVALID');
  }
  const normalized = reason.trim();
  if (!normalized || normalized.length > 100) {
    throw new Error('ASSET_REASON_INVALID');
  }
  return normalized;
}

function validateChangeType(type) {
  if (type !== 'deposit' && type !== 'withdraw') {
    throw new Error('ASSET_CHANGE_TYPE_INVALID');
  }
  return type;
}

function normalizeChangeAmount(amount) {
  const isNumber = typeof amount === 'number' && Number.isFinite(amount);
  const isDecimalString = typeof amount === 'string'
    && /^\d+(?:\.\d+)?$/.test(amount);
  if (!isNumber && !isDecimalString) {
    throw new Error('ASSET_AMOUNT_INVALID');
  }

  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('ASSET_AMOUNT_INVALID');
  }
  return normalized;
}

async function getAssets(database = db) {
  try {
    const result = await database.collection('family_assets').doc(ASSET_DOCUMENT_ID).get();
    return result.data;
  } catch (error) {
    if (isMissingDocumentError(error)) {
      return { totalAmount: 0 };
    }
    throw error;
  }
}

async function updateAssets(openid, type, amountInput, reason) {
  const changeType = validateChangeType(type);
  const amount = normalizeChangeAmount(amountInput);
  const normalizedReason = normalizeReason(reason);

  return db.runTransaction(async (transaction) => {
    const current = await getAssets(transaction);
    const beforeAmount = Number(current.totalAmount || 0);
    const afterAmount = changeType === 'deposit' ? beforeAmount + amount : beforeAmount - amount;
    if (afterAmount < 0) {
      throw new Error('ASSET_BALANCE_INSUFFICIENT');
    }
    const now = db.serverDate();
    const asset = {
      totalAmount: afterAmount,
      updatedByOpenid: openid,
      updatedAt: now
    };

    await transaction.collection('family_assets').doc(ASSET_DOCUMENT_ID).set({ data: asset });
    await transaction.collection('asset_changes').add({ data: {
      type: changeType,
      amount,
      beforeAmount,
      afterAmount,
      reason: normalizedReason,
      operatorOpenid: openid,
      createdAt: now
    } });

    return { _id: ASSET_DOCUMENT_ID, ...asset };
  });
}

async function listChanges() {
  return (await db.collection('asset_changes').orderBy('createdAt', 'desc').get()).data;
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  await requireAllowed(openid);

  if (event.action === 'get') {
    return { ok: true, asset: await getAssets() };
  }

  if (event.action === 'update') {
    const asset = await updateAssets(openid, event.type, event.amount, event.reason);
    return { ok: true, asset };
  }

  if (event.action === 'listChanges') {
    return { ok: true, changes: await listChanges() };
  }

  throw new Error('UNKNOWN_ACTION');
};
