const { ensureAllowedSession } = require('../../services/session');

Page({
  data: {
    loading: true
  },

  onLoad() {
    ensureAllowedSession()
      .then(() => {
        this.setData({ loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  }
});
