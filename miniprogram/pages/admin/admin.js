const {
  checkAdmin,
  listAdminCollections,
  queryAdminDocuments,
  getAdminDocument,
  createAdminDocument,
  updateAdminDocument,
  setAdminDocument,
  removeAdminDocument
} = require('../../services/cloud');

const ERROR_MESSAGES = {
  ADMIN_DENIED: '无管理员权限',
  COLLECTION_NOT_ALLOWED: '集合不允许操作',
  DOCUMENT_ID_REQUIRED: '请输入文档 ID',
  DOCUMENT_NOT_FOUND: '文档不存在',
  JSON_INVALID: 'JSON 格式不正确',
  DATA_INVALID: '数据必须是对象',
  UNKNOWN_ACTION: '未知操作'
};

function errorCode(error) {
  const text = [
    error && error.message,
    error && error.errMsg,
    error && error.errCode
  ].filter(Boolean).join(' ');
  return Object.keys(ERROR_MESSAGES).find((code) => text.includes(code)) || '';
}

function errorMessage(error, fallback = '操作失败，请稍后重试') {
  const friendly = ERROR_MESSAGES[errorCode(error)];
  if (friendly) return friendly;
  if (error && error.errCode) {
    return [
      error.errCode,
      error.message,
      error.errMsg
    ].filter(Boolean).join(' ');
  }
  return fallback;
}

function formatted(document) {
  return JSON.stringify(document, null, 2);
}

function snapshotText(document) {
  const text = formatted(document);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function beginMutation(page, { includeEditor = true } = {}) {
  const token = (page.mutationToken || 0) + 1;
  page.mutationToken = token;
  const operation = {
    token,
    collection: page.data.selectedCollection,
    id: page.data.selectedId
  };
  if (includeEditor) operation.editorText = page.data.editorText;
  page.setData({ saving: true });
  return operation;
}

function mutationIsCurrent(page, operation) {
  return page.mutationToken === operation.token
    && page.data.saving
    && page.data.selectedCollection === operation.collection
    && page.data.selectedId === operation.id
    && (
      operation.editorText === undefined
      || page.data.editorText === operation.editorText
    );
}

function releaseMutation(page, operation) {
  if (page.mutationToken === operation.token) page.setData({ saving: false });
}

function handleMutationFailure(page, operation, error) {
  const current = mutationIsCurrent(page, operation);
  releaseMutation(page, operation);
  if (current) wx.showToast({ title: errorMessage(error), icon: 'none' });
}

Page({
  data: {
    checking: true,
    authorized: null,
    loading: false,
    saving: false,
    collections: [],
    selectedCollection: '',
    selectedCollectionWritable: false,
    documentId: '',
    keyword: '',
    documents: [],
    selectedId: '',
    editorText: '{}',
    editorMode: 'create',
    errorMessage: ''
  },

  onLoad() {
    return this.loadConsole();
  },

  loadConsole() {
    if (this.data.saving) return Promise.resolve();
    this.setData({ checking: true, errorMessage: '' });
    return checkAdmin().then(
      () => {
        this.setData({ authorized: true });
        return listAdminCollections()
          .then(({ collections }) => {
            this.setData({
              checking: false,
              collections,
              selectedCollection: collections[0] || '',
              selectedCollectionWritable: Boolean(collections[0])
            });
            return this.queryDocuments();
          })
          .catch((error) => {
            this.setData({
              checking: false,
              errorMessage: errorMessage(error, '加载失败，请稍后重试')
            });
          });
      },
      (error) => {
        const update = {
          checking: false,
          errorMessage: errorMessage(error, '权限验证失败，请稍后重试')
        };
        if (errorCode(error) === 'ADMIN_DENIED') update.authorized = false;
        this.setData(update);
      }
    );
  },

  queryDocuments() {
    if (
      this.data.saving
      || !this.data.authorized
      || !this.data.selectedCollection
    ) return Promise.resolve();
    const requestToken = (this.queryRequestToken || 0) + 1;
    this.queryRequestToken = requestToken;
    this.setData({ loading: true, errorMessage: '' });
    const id = this.data.documentId.trim();
    const request = id
      ? getAdminDocument(this.data.selectedCollection, id)
        .then(({ document }) => ({ documents: [document] }))
      : queryAdminDocuments(this.data.selectedCollection, {
        keyword: this.data.keyword.trim(),
        limit: 20,
        offset: 0
      });
    return request
      .then(({ documents }) => {
        if (this.queryRequestToken !== requestToken) return;
        this.setData({ loading: false, documents: documents || [] });
      })
      .catch((error) => {
        if (this.queryRequestToken !== requestToken) return;
        this.setData({
          loading: false,
          documents: [],
          errorMessage: errorMessage(error, '查询失败，请稍后重试')
        });
      });
  },

  onCollectionChange(event) {
    if (this.data.saving) return Promise.resolve();
    const selectedCollection = this.data.collections[Number(event.detail.value)];
    this.setData({
      selectedCollection,
      selectedCollectionWritable: Boolean(selectedCollection),
      documentId: '',
      keyword: '',
      documents: [],
      selectedId: '',
      editorText: '{}',
      editorMode: 'create',
      errorMessage: ''
    });
    return this.queryDocuments();
  },

  onDocumentIdInput(event) {
    if (!this.data.saving) this.setData({ documentId: event.detail.value });
  },
  onKeywordInput(event) {
    if (!this.data.saving) this.setData({ keyword: event.detail.value });
  },
  onEditorInput(event) {
    if (!this.data.saving) this.setData({ editorText: event.detail.value });
  },

  selectDocument(event) {
    if (this.data.saving) return;
    const selectedId = event.currentTarget.dataset.id;
    const document = this.data.documents.find((item) => item._id === selectedId);
    if (!document) return;
    const { _id, ...editable } = document;
    this.setData({
      selectedId: _id,
      editorText: formatted(editable),
      editorMode: 'edit',
      errorMessage: ''
    });
  },

  startCreate() {
    if (this.data.saving) return;
    this.setData({ selectedId: '', editorText: '{}', editorMode: 'create' });
  },

  parseEditor() {
    let data;
    try {
      data = JSON.parse(this.data.editorText);
    } catch (_error) {
      wx.showToast({ title: 'JSON 格式不正确', icon: 'none' });
      return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      wx.showToast({ title: '数据必须是对象', icon: 'none' });
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(data, '_id')) {
      wx.showToast({ title: 'JSON 中不能包含 _id', icon: 'none' });
      return null;
    }
    return data;
  },

  refreshAfterWrite(document, operation) {
    if (!mutationIsCurrent(this, operation)) {
      releaseMutation(this, operation);
      return Promise.resolve();
    }
    this.setData({
      saving: false,
      selectedId: document ? document._id : '',
      editorMode: document ? 'edit' : 'create',
      editorText: document
        ? formatted(Object.fromEntries(Object.entries(document).filter(([key]) => key !== '_id')))
        : '{}'
    });
    wx.showToast({ title: '操作成功', icon: 'success' });
    return this.queryDocuments();
  },

  createDocument() {
    if (this.data.saving) return Promise.resolve();
    const data = this.parseEditor();
    if (!data) return Promise.resolve();
    const operation = beginMutation(this);
    return createAdminDocument(operation.collection, data)
      .then(({ document }) => this.refreshAfterWrite(document, operation))
      .catch((error) => handleMutationFailure(this, operation, error));
  },

  updateDocument() {
    if (this.data.saving) return Promise.resolve();
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择文档', icon: 'none' });
      return Promise.resolve();
    }
    const data = this.parseEditor();
    if (!data) return Promise.resolve();
    const operation = beginMutation(this);
    return updateAdminDocument(
      operation.collection,
      operation.id,
      data
    )
      .then(({ document }) => this.refreshAfterWrite(document, operation))
      .catch((error) => handleMutationFailure(this, operation, error));
  },

  setDocument() {
    if (this.data.saving) return;
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择文档', icon: 'none' });
      return;
    }
    const data = this.parseEditor();
    if (!data) return;
    const operation = beginMutation(this);
    wx.showModal({
      title: '覆盖文档',
      content: `将完整覆盖 ${operation.collection} / ${operation.id}，未写入的字段会被删除。`,
      confirmText: '确认覆盖',
      confirmColor: '#FF9500',
      success: ({ confirm }) => {
        if (!this.data.saving || this.mutationToken !== operation.token) return;
        if (!confirm || !mutationIsCurrent(this, operation)) {
          releaseMutation(this, operation);
          return;
        }
        setAdminDocument(operation.collection, operation.id, data)
          .then(({ document }) => this.refreshAfterWrite(document, operation))
          .catch((error) => handleMutationFailure(this, operation, error));
      },
      fail: (error) => handleMutationFailure(this, operation, error)
    });
  },

  removeDocument() {
    if (this.data.saving) return;
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择文档', icon: 'none' });
      return;
    }
    const operation = beginMutation(this, { includeEditor: false });
    return getAdminDocument(operation.collection, operation.id)
      .then(({ document }) => {
        if (!mutationIsCurrent(this, operation)) {
          releaseMutation(this, operation);
          return;
        }
        wx.showModal({
          title: '删除文档',
          content: `删除 ${operation.collection} / ${operation.id} 后无法恢复：\n${snapshotText(document)}`,
          confirmText: '确认删除',
          confirmColor: '#FF3B30',
          success: ({ confirm }) => {
            if (!this.data.saving || this.mutationToken !== operation.token) return;
            if (!confirm || !mutationIsCurrent(this, operation)) {
              releaseMutation(this, operation);
              return;
            }
            removeAdminDocument(operation.collection, operation.id)
              .then(() => this.refreshAfterWrite(null, operation))
              .catch((error) => handleMutationFailure(this, operation, error));
          },
          fail: (error) => handleMutationFailure(this, operation, error)
        });
      })
      .catch((error) => handleMutationFailure(this, operation, error));
  }
});
