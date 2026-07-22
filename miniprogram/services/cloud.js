function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((response) => response.result);
}

module.exports = {
  callCloud
};
