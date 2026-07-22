const { callCloud } = require('./cloud');

function ensureAllowedSession() {
  const app = getApp();

  if (app.globalData.session && app.globalData.session.allowed) {
    return Promise.resolve(app.globalData.session);
  }

  return callCloud('login').then((session) => {
    app.globalData.session = session;

    if (!session.allowed) {
      wx.reLaunch({ url: '/pages/auth-denied/auth-denied' });
      return Promise.reject(new Error('AUTH_DENIED'));
    }

    return session;
  });
}

module.exports = {
  ensureAllowedSession
};
