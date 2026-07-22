function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((response) => response.result);
}

module.exports = {
  callCloud,
  getAssets,
  updateAssets
};

function getAssets() {
  return callCloud('assets', { action: 'get' });
}

function updateAssets(totalAmount, reason) {
  return callCloud('assets', { action: 'update', totalAmount, reason });
}
