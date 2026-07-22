const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const result = await db.collection('users').where({ openid }).limit(1).get();
  const user = result.data[0] || null;
  const allowed = Boolean(user && user.enabled === true);

  return {
    openid,
    allowed,
    user
  };
};
