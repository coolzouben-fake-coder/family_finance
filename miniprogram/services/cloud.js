function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((response) => response.result);
}

function getAssets() {
  return callCloud('assets', { action: 'get' });
}

function updateAssets(totalAmount, reason) {
  return callCloud('assets', { action: 'update', totalAmount, reason });
}

function listProjects(filters = {}) { return callCloud('projects', { action: 'list', ...filters }); }
function listCategories() { return callCloud('projects', { action: 'listCategories' }); }
function createProject(project) { return callCloud('projects', { action: 'create', project }); }
function updateProject(id, project) { return callCloud('projects', { action: 'update', id, project }); }
function redeemProject(id, redeemData) { return callCloud('projects', { action: 'redeem', id, redeemData }); }
function getAnnualStats(year) { return callCloud('stats', { action: 'annual', year }); }

module.exports = {
  callCloud, getAssets, updateAssets, listProjects, listCategories, createProject, updateProject, redeemProject, getAnnualStats
};
