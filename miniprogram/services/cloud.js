function callCloud(name, data = {}, options = {}) {
  return wx.cloud.callFunction({ name, data })
    .then((response) => {
      const result = response.result;
      if (result && result.ok === false) {
        const error = new Error(result.errorMessage || result.errorCode || 'CLOUD_FUNCTION_FAILED');
        error.errCode = result.errorCode;
        error.errMsg = result.errorMessage;
        throw error;
      }
      return result;
    })
    .catch((error) => {
      if (!options.silent) {
        console.error('[cloud function failed]', {
          name,
          action: data.action || '',
          errCode: error && error.errCode,
          errMsg: error && error.errMsg,
          message: error && error.message,
          error
        });
      }
      throw error;
    });
}

function getAssets() {
  return callCloud('assets', { action: 'get' });
}

function updateAssets(type, amount, reason) {
  return callCloud('assets', { action: 'update', type, amount, reason });
}

function listAssetChanges() { return callCloud('assets', { action: 'listChanges' }, { silent: true }); }

function listProjects(filters = {}) { return callCloud('projects', { action: 'list', ...filters }); }
function listCategories() { return callCloud('projects', { action: 'listCategories' }); }
function listUsers() { return callCloud('projects', { action: 'listUsers' }); }
function createProject(project) { return callCloud('projects', { action: 'create', project }); }
function updateProject(id, project) { return callCloud('projects', { action: 'update', id, project }); }
function redeemProject(id, redeemData) { return callCloud('projects', { action: 'redeem', id, redeemData }); }
function receiveReturnProject(id, returnData) { return callCloud('projects', { action: 'receiveReturn', id, returnData }); }
function receiveRewardProject(id, rewardData) { return callCloud('projects', { action: 'receiveReward', id, rewardData }); }
function redeemPrincipalProject(id, redeemData) { return callCloud('projects', { action: 'redeemPrincipal', id, redeemData }); }
function correctRedemption(id, redeemData) { return callCloud('projects', { action: 'correctRedemption', id, redeemData }); }
function cancelProject(id) { return callCloud('projects', { action: 'cancel', id }); }
function removeProject(id) { return callCloud('projects', { action: 'remove', id }); }
function getAnnualStats(year) { return callCloud('stats', { action: 'annual', year }); }

function checkAdmin() { return callCloud('admin', { action: 'check' }); }
function listAdminCollections() { return callCloud('admin', { action: 'listCollections' }); }
function queryAdminDocuments(collection, options = {}) {
  const { keyword, limit, offset } = options;
  return callCloud('admin', { action: 'query', collection, keyword, limit, offset });
}
function getAdminDocument(collection, id) {
  return callCloud('admin', { action: 'get', collection, id });
}
function createAdminDocument(collection, data) {
  return callCloud('admin', { action: 'create', collection, data });
}
function updateAdminDocument(collection, id, data) {
  return callCloud('admin', { action: 'update', collection, id, data });
}
function setAdminDocument(collection, id, data) {
  return callCloud('admin', { action: 'set', collection, id, data });
}
function removeAdminDocument(collection, id) {
  return callCloud('admin', { action: 'remove', collection, id });
}

module.exports = {
  callCloud, getAssets, updateAssets, listAssetChanges, listProjects, listCategories, listUsers, createProject, updateProject,
  redeemProject, receiveReturnProject, receiveRewardProject, redeemPrincipalProject, correctRedemption, cancelProject, removeProject, getAnnualStats,
  checkAdmin, listAdminCollections, queryAdminDocuments, getAdminDocument, createAdminDocument, updateAdminDocument,
  setAdminDocument, removeAdminDocument
};
