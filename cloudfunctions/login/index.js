const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_ENABLED_USERS = 2;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const enabledResult = await db.collection('users').where({ enabled: true }).get();
  const whitelistValid = enabledResult.data.length <= MAX_ENABLED_USERS;
  if (whitelistValid && enabledResult.data.length === 0 && typeof openid === 'string' && openid) {
    const user = {
      openid,
      nickname: '我',
      role: 'member',
      enabled: true,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    await db.collection('users').add({ data: user });
    return {
      openid,
      allowed: true,
      user,
      whitelistValid
    };
  }
  const user = whitelistValid
    ? enabledResult.data.find((candidate) => candidate.openid === openid) || null
    : null;
  const allowed = Boolean(user);

  return {
    openid,
    allowed,
    user,
    whitelistValid
  };
};
