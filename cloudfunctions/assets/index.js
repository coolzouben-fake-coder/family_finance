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
  if (!error) return false;
  if (error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') return true;

  const message = String(error.message || error.errMsg || '');
  return message.includes('document.get:fail') && message.includes('does not exist');
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

function normalizeDepositId(depositId) {
  if (typeof depositId !== 'string' || !depositId.trim()) {
    throw new Error('ASSET_REPAY_DEPOSIT_ID_INVALID');
  }
  return depositId.trim();
}

function isDepositChange(change) {
  if (!change) return false;
  if (change.type === 'deposit') return true;
  if (change.type) return false;
  return Number(change.afterAmount || 0) >= Number(change.beforeAmount || 0);
}

function sumRepayments(changes, depositId) {
  return changes
    .filter((change) => change.type === 'repay' && change.relatedDepositId === depositId)
    .reduce((total, change) => total + Number(change.amount || 0), 0);
}

function decorateDepositsWithRepaymentState(changes) {
  return changes.map((change) => {
    if (!isDepositChange(change)) return change;

    const depositAmount = Number(change.amount || Math.abs(Number(change.afterAmount || 0) - Number(change.beforeAmount || 0)));
    const repaidAmount = sumRepayments(changes, change._id);
    const outstandingAmount = Math.max(depositAmount - repaidAmount, 0);
    return {
      ...change,
      repaidAmount,
      outstandingAmount,
      repayable: outstandingAmount > 0
    };
  });
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

async function getRepaymentRows(transaction, depositId) {
  const result = await transaction.collection('asset_changes')
    .where({ type: 'repay', relatedDepositId: depositId })
    .get();
  return result.data || [];
}

async function repayDeposit(openid, depositIdInput, amountInput, reason) {
  const depositId = normalizeDepositId(depositIdInput);
  const amount = normalizeChangeAmount(amountInput);
  const normalizedReason = normalizeReason(reason);

  return db.runTransaction(async (transaction) => {
    const current = await getAssets(transaction);
    const depositResult = await transaction.collection('asset_changes').doc(depositId).get();
    const deposit = depositResult.data;
    if (!isDepositChange(deposit)) {
      throw new Error('ASSET_REPAY_TARGET_INVALID');
    }

    const depositAmount = Number(deposit.amount || Math.abs(Number(deposit.afterAmount || 0) - Number(deposit.beforeAmount || 0)));
    const repaymentRows = await getRepaymentRows(transaction, depositId);
    const repaidAmount = sumRepayments(repaymentRows, depositId);
    const outstandingAmount = Math.max(depositAmount - repaidAmount, 0);
    if (amount > outstandingAmount) {
      throw new Error('ASSET_REPAY_AMOUNT_EXCEEDS_OUTSTANDING');
    }

    const beforeAmount = Number(current.totalAmount || 0);
    const afterAmount = beforeAmount - amount;
    if (afterAmount < 0) {
      throw new Error('ASSET_BALANCE_INSUFFICIENT');
    }

    const now = db.serverDate();
    const asset = {
      totalAmount: afterAmount,
      updatedByOpenid: openid,
      updatedAt: now
    };
    const change = {
      type: 'repay',
      amount,
      relatedDepositId: depositId,
      beforeAmount,
      afterAmount,
      reason: normalizedReason,
      operatorOpenid: openid,
      createdAt: now
    };

    await transaction.collection('family_assets').doc(ASSET_DOCUMENT_ID).set({ data: asset });
    const addResult = await transaction.collection('asset_changes').add({ data: change });

    return {
      asset: { _id: ASSET_DOCUMENT_ID, ...asset },
      change: { _id: addResult && addResult._id, ...change }
    };
  });
}

async function listChanges() {
  const changes = (await db.collection('asset_changes').orderBy('createdAt', 'desc').get()).data;
  return decorateDepositsWithRepaymentState(changes);
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

  if (event.action === 'repay') {
    const result = await repayDeposit(openid, event.depositId, event.amount, event.reason);
    return { ok: true, asset: result.asset, change: result.change };
  }

  if (event.action === 'listChanges') {
    return { ok: true, changes: await listChanges() };
  }

  throw new Error('UNKNOWN_ACTION');
};
