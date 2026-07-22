App({
  globalData: {
    session: null
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '当前微信版本过低',
        content: '请升级微信后使用云开发能力。',
        showCancel: false
      });
      return;
    }

    wx.cloud.init({ traceUser: true });
  }
});
