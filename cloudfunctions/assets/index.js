const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ openid, enabled: true }).limit(1).get();
  if (result.data.length === 0) {
    throw new Error('AUTH_DENIED');
  }
}

async function getAssets() {
  const result = await db.collection('family_assets').limit(1).get();
  return result.data[0] || { totalAmount: 0 };
}

async function updateAssets(openid, totalAmount, reason) {
  if (Number(totalAmount) < 0) {
    throw new Error('TOTAL_AMOUNT_INVALID');
  }

  const current = await getAssets();
  const now = db.serverDate();

  if (current._id) {
    await db.collection('family_assets').doc(current._id).update({
      data: {
        totalAmount: Number(totalAmount),
        updatedByOpenid: openid,
        updatedAt: now
      }
    });
  } else {
    await db.collection('family_assets').add({
      data: {
        totalAmount: Number(totalAmount),
        updatedByOpenid: openid,
        updatedAt: now
      }
    });
  }

  await db.collection('asset_changes').add({
    data: {
      beforeAmount: Number(current.totalAmount || 0),
      afterAmount: Number(totalAmount),
      reason: reason || '调整家庭总资产',
      operatorOpenid: openid,
      createdAt: now
    }
  });

  return getAssets();
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  await requireAllowed(openid);

  if (event.action === 'get') {
    return { ok: true, asset: await getAssets() };
  }

  if (event.action === 'update') {
    const asset = await updateAssets(openid, event.totalAmount, event.reason);
    return { ok: true, asset };
  }

  throw new Error('UNKNOWN_ACTION');
};
