const mockCheckAdmin = jest.fn();
const mockListAdminCollections = jest.fn();
const mockQueryAdminDocuments = jest.fn();
const mockGetAdminDocument = jest.fn();
const mockCreateAdminDocument = jest.fn();
const mockUpdateAdminDocument = jest.fn();
const mockSetAdminDocument = jest.fn();
const mockRemoveAdminDocument = jest.fn();
const fs = require('fs');
const path = require('path');

const adminMarkup = fs.readFileSync(
  path.join(__dirname, '..', 'pages', 'admin', 'admin.wxml'),
  'utf8'
);

jest.mock('../services/cloud', () => ({
  checkAdmin: mockCheckAdmin,
  listAdminCollections: mockListAdminCollections,
  queryAdminDocuments: mockQueryAdminDocuments,
  getAdminDocument: mockGetAdminDocument,
  createAdminDocument: mockCreateAdminDocument,
  updateAdminDocument: mockUpdateAdminDocument,
  setAdminDocument: mockSetAdminDocument,
  removeAdminDocument: mockRemoveAdminDocument
}));

let definition;

function page() {
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) { this.data = { ...this.data, ...update }; }
  };
  [
    'onLoad', 'loadConsole', 'queryDocuments', 'onCollectionChange', 'onDocumentIdInput',
    'onKeywordInput', 'selectDocument', 'startCreate', 'onEditorInput', 'createDocument',
    'updateDocument', 'setDocument', 'removeDocument', 'parseEditor', 'refreshAfterWrite'
  ].forEach((name) => { instance[name] = definition[name].bind(instance); });
  return instance;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('admin console page', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckAdmin.mockResolvedValue({ ok: true, isAdmin: true });
    mockListAdminCollections.mockResolvedValue({
      collections: ['users', 'projects', 'categories', 'family_assets', 'asset_changes']
    });
    mockQueryAdminDocuments.mockResolvedValue({
      documents: [{ _id: 'project-1', name: '华泰稳健一号' }]
    });
    mockGetAdminDocument.mockResolvedValue({
      document: { _id: 'project-1', name: '华泰稳健一号' }
    });
    mockCreateAdminDocument.mockResolvedValue({
      document: { _id: 'project-2', name: '新增项目' }
    });
    mockUpdateAdminDocument.mockResolvedValue({
      document: { _id: 'project-1', name: '更新项目' }
    });
    mockSetAdminDocument.mockResolvedValue({
      document: { _id: 'project-1', name: '覆盖项目' }
    });
    mockRemoveAdminDocument.mockResolvedValue({ ok: true });
    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true }))
    };
    global.Page = (value) => { definition = value; };
    require('../pages/admin/admin');
  });

  afterEach(() => {
    delete global.wx;
    delete global.Page;
  });

  test('checks permission before loading collections and documents', async () => {
    const instance = page();
    instance.onLoad();
    await flushPromises();
    expect(mockCheckAdmin).toHaveBeenCalledTimes(1);
    expect(instance.data.authorized).toBe(true);
    expect(instance.data.selectedCollection).toBe('users');
    expect(mockQueryAdminDocuments).toHaveBeenCalledWith('users', {
      keyword: '', limit: 20, offset: 0
    });
  });

  test('shows no-permission state and never loads CRUD data for a denied caller', async () => {
    mockCheckAdmin.mockRejectedValue(new Error('ADMIN_DENIED'));
    const instance = page();
    instance.onLoad();
    await flushPromises();
    expect(instance.data.authorized).toBe(false);
    expect(instance.data.errorMessage).toBe('无管理员权限');
    expect(mockListAdminCollections).not.toHaveBeenCalled();
    expect(mockQueryAdminDocuments).not.toHaveBeenCalled();
  });

  test('keeps the console authorized when collection loading fails after permission succeeds', async () => {
    mockListAdminCollections.mockRejectedValue(new Error('collection load failed'));
    const instance = page();

    await instance.onLoad();

    expect(instance.data.checking).toBe(false);
    expect(instance.data.authorized).toBe(true);
    expect(instance.data.errorMessage).toBe('加载失败，请稍后重试');
    expect(adminMarkup).toContain(
      'class="retry-button" disabled="{{saving || checking}}" bindtap="loadConsole">重试加载</button>'
    );
  });

  test('only revokes an existing authorized state for ADMIN_DENIED', async () => {
    mockCheckAdmin.mockRejectedValue(new Error('network unavailable'));
    const instance = page();
    instance.setData({ authorized: true });

    await instance.loadConsole();

    expect(instance.data.authorized).toBe(true);
    expect(instance.data.errorMessage).toBe('权限验证失败，请稍后重试');
  });

  test('shows a retryable check error without treating it as ADMIN_DENIED', async () => {
    mockCheckAdmin.mockRejectedValue(new Error('network unavailable'));
    const instance = page();

    await instance.loadConsole();

    expect(instance.data.authorized).toBeNull();
    expect(instance.data.errorMessage).toBe('权限验证失败，请稍后重试');
    expect(adminMarkup).toContain('bindtap="loadConsole">重试</button>');
  });

  test('uses exact get when a document ID is entered', async () => {
    const instance = page();
    instance.setData({ authorized: true, selectedCollection: 'projects', documentId: 'project-1' });
    await instance.queryDocuments();
    expect(mockGetAdminDocument).toHaveBeenCalledWith('projects', 'project-1');
    expect(instance.data.documents).toEqual([expect.objectContaining({ _id: 'project-1' })]);
  });

  test('ignores an older collection query that resolves after the current collection', async () => {
    const projectsQuery = deferred();
    const usersQuery = deferred();
    mockQueryAdminDocuments.mockImplementation((collection) => (
      collection === 'projects' ? projectsQuery.promise : usersQuery.promise
    ));
    const instance = page();
    instance.setData({
      authorized: true,
      collections: ['projects', 'users'],
      selectedCollection: 'projects'
    });

    const olderRequest = instance.queryDocuments();
    const currentRequest = instance.onCollectionChange({ detail: { value: 1 } });
    usersQuery.resolve({ documents: [{ _id: 'user-1' }] });
    await currentRequest;
    projectsQuery.resolve({ documents: [{ _id: 'project-1' }] });
    await olderRequest;

    expect(instance.data.selectedCollection).toBe('users');
    expect(instance.data.documents).toEqual([{ _id: 'user-1' }]);
  });

  test('ignores an older collection query failure after the current collection succeeds', async () => {
    const projectsQuery = deferred();
    const usersQuery = deferred();
    mockQueryAdminDocuments.mockImplementation((collection) => (
      collection === 'projects' ? projectsQuery.promise : usersQuery.promise
    ));
    const instance = page();
    instance.setData({
      authorized: true,
      collections: ['projects', 'users'],
      selectedCollection: 'projects'
    });

    const olderRequest = instance.queryDocuments();
    const currentRequest = instance.onCollectionChange({ detail: { value: 1 } });
    usersQuery.resolve({ documents: [{ _id: 'user-1' }] });
    await currentRequest;
    projectsQuery.reject(new Error('DOCUMENT_NOT_FOUND'));
    await olderRequest;

    expect(instance.data.documents).toEqual([{ _id: 'user-1' }]);
    expect(instance.data.errorMessage).toBe('');
  });

  test('blocks invalid or non-object JSON', async () => {
    const instance = page();
    instance.setData({ editorText: '{bad json', selectedCollection: 'projects' });
    await instance.createDocument();
    expect(mockCreateAdminDocument).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: 'JSON 格式不正确', icon: 'none' });

    instance.setData({ editorText: '[]' });
    await instance.createDocument();
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '数据必须是对象', icon: 'none' });
  });

  test('blocks editor data containing _id', async () => {
    const instance = page();
    instance.setData({
      editorText: '{"_id":"project-2","name":"项目"}',
      selectedCollection: 'projects'
    });

    await instance.createDocument();

    expect(mockCreateAdminDocument).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: 'JSON 中不能包含 _id',
      icon: 'none'
    });
  });

  test('keeps all listed collections writable in state and markup', async () => {
    const instance = page();
    instance.setData({
      authorized: true,
      collections: ['projects', 'users'],
      selectedCollection: 'projects'
    });

    await instance.onCollectionChange({ detail: { value: 1 } });

    expect(instance.data.selectedCollection).toBe('users');
    expect(instance.data.selectedCollectionWritable).toBe(true);
    expect(adminMarkup).toContain('class="editor-actions"');
    expect(adminMarkup).not.toContain('selectedCollectionWritable');
  });

  test.each([
    ['create', 'createDocument', mockCreateAdminDocument, { selectedId: '', editorText: '{"name":"新增"}' }],
    ['update', 'updateDocument', mockUpdateAdminDocument, {
      selectedId: 'project-1', editorText: '{"name":"更新"}'
    }]
  ])('locks collection context and prevents duplicate %s calls', async (
    _operation,
    handler,
    cloudMock,
    state
  ) => {
    const pending = deferred();
    cloudMock.mockReturnValue(pending.promise);
    const instance = page();
    instance.setData({
      authorized: true,
      collections: ['projects', 'users'],
      selectedCollection: 'projects',
      ...state
    });

    const first = instance[handler]();
    const second = instance[handler]();
    instance.onCollectionChange({ detail: { value: 1 } });

    expect(cloudMock).toHaveBeenCalledTimes(1);
    expect(instance.data.selectedCollection).toBe('projects');
    expect(instance.data.saving).toBe(true);
    expect(second).toBeInstanceOf(Promise);

    pending.resolve({ document: { _id: 'project-1', name: '完成' } });
    await first;
  });

  test('prevents duplicate overwrite modals and binds confirmation to collection and id', async () => {
    const pending = deferred();
    mockSetAdminDocument.mockReturnValue(pending.promise);
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"覆盖"}'
    });

    instance.setDocument();
    instance.setDocument();

    expect(global.wx.showModal).toHaveBeenCalledTimes(1);
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('projects / project-1')
    }));
    expect(mockSetAdminDocument).toHaveBeenCalledTimes(1);

    pending.resolve({ document: { _id: 'project-1', name: '覆盖' } });
    await flushPromises();
  });

  test('releases saving when the overwrite confirmation modal fails', () => {
    let failCallback;
    global.wx.showModal.mockImplementation((options) => {
      failCallback = options.fail;
      if (failCallback) failCallback(new Error('modal unavailable'));
    });
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"覆盖"}'
    });

    instance.setDocument();

    expect(failCallback).toEqual(expect.any(Function));
    expect(instance.data.saving).toBe(false);
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '操作失败，请稍后重试',
      icon: 'none'
    });
    expect(mockSetAdminDocument).not.toHaveBeenCalled();
  });

  test('locks collection context during delete preflight and prevents duplicate delete work', async () => {
    const preflight = deferred();
    mockGetAdminDocument.mockReturnValue(preflight.promise);
    const instance = page();
    instance.setData({
      authorized: true,
      collections: ['projects', 'users'],
      selectedCollection: 'projects',
      selectedId: 'project-1'
    });

    const first = instance.removeDocument();
    const second = instance.removeDocument();
    instance.onCollectionChange({ detail: { value: 1 } });

    expect(mockGetAdminDocument).toHaveBeenCalledTimes(1);
    expect(global.wx.showModal).not.toHaveBeenCalled();
    expect(instance.data.selectedCollection).toBe('projects');
    expect(second).toBeUndefined();

    preflight.resolve({ document: { _id: 'project-1', name: '待删除' } });
    await first;
    expect(global.wx.showModal).toHaveBeenCalledTimes(1);
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('projects / project-1')
    }));
    expect(mockRemoveAdminDocument).toHaveBeenCalledTimes(1);
  });

  test('releases saving when the delete confirmation modal fails', async () => {
    let failCallback;
    global.wx.showModal.mockImplementation((options) => {
      failCallback = options.fail;
      if (failCallback) failCallback(new Error('modal unavailable'));
    });
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1'
    });

    await instance.removeDocument();

    expect(failCallback).toEqual(expect.any(Function));
    expect(instance.data.saving).toBe(false);
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '操作失败，请稍后重试',
      icon: 'none'
    });
    expect(mockRemoveAdminDocument).not.toHaveBeenCalled();
  });

  test('ignores a mutation success after its captured context is replaced', async () => {
    const pending = deferred();
    mockCreateAdminDocument.mockReturnValue(pending.promise);
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: '',
      editorText: '{"name":"新增"}'
    });

    const request = instance.createDocument();
    instance.setData({ selectedCollection: 'users', editorText: '{}' });
    pending.resolve({ document: { _id: 'project-2', name: '新增' } });
    await request;

    expect(instance.data.selectedCollection).toBe('users');
    expect(instance.data.selectedId).toBe('');
    expect(global.wx.showToast).not.toHaveBeenCalled();
    expect(mockQueryAdminDocuments).not.toHaveBeenCalled();
  });

  test('ignores a mutation failure after its captured context is replaced', async () => {
    const pending = deferred();
    mockUpdateAdminDocument.mockReturnValue(pending.promise);
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"更新"}'
    });

    const request = instance.updateDocument();
    instance.setData({ selectedCollection: 'users', selectedId: 'user-1', editorText: '{}' });
    pending.reject(new Error('DOCUMENT_NOT_FOUND'));
    await request;

    expect(instance.data.selectedCollection).toBe('users');
    expect(instance.data.selectedId).toBe('user-1');
    expect(global.wx.showToast).not.toHaveBeenCalled();
  });

  test('disables all mutation and context-changing controls while saving', () => {
    expect(adminMarkup).toContain(
      '<picker mode="selector" range="{{collections}}" disabled="{{saving}}" bindchange="onCollectionChange">'
    );
    expect(adminMarkup).toContain('bindinput="onDocumentIdInput" disabled="{{saving}}"');
    expect(adminMarkup).toContain('bindinput="onKeywordInput" disabled="{{saving}}"');
    expect(adminMarkup).toContain(
      'class="weui-btn weui-btn_primary query-button" loading="{{loading}}" disabled="{{saving}}"'
    );
    expect(adminMarkup.match(/disabled="{{saving}}"/g)).toHaveLength(10);
  });

  test('does not truncate long JSON documents in the editor textarea', () => {
    expect(adminMarkup).toContain('class="json-editor"');
    expect(adminMarkup).toContain('maxlength="-1"');
  });

  test('ignores context-changing handlers while saving', async () => {
    const instance = page();
    instance.setData({
      authorized: true,
      saving: true,
      documentId: 'project-1',
      keyword: '原关键词',
      documents: [{ _id: 'project-2', name: '项目' }],
      selectedId: 'project-1',
      editorText: '{"name":"原内容"}',
      editorMode: 'edit'
    });

    instance.onDocumentIdInput({ detail: { value: 'project-2' } });
    instance.onKeywordInput({ detail: { value: '新关键词' } });
    instance.onEditorInput({ detail: { value: '{}' } });
    instance.selectDocument({ currentTarget: { dataset: { id: 'project-2' } } });
    instance.startCreate();
    await instance.queryDocuments();
    await instance.loadConsole();

    expect(instance.data).toEqual(expect.objectContaining({
      documentId: 'project-1',
      keyword: '原关键词',
      selectedId: 'project-1',
      editorText: '{"name":"原内容"}',
      editorMode: 'edit'
    }));
    expect(mockQueryAdminDocuments).not.toHaveBeenCalled();
    expect(mockCheckAdmin).not.toHaveBeenCalled();
  });

  test('fetches the complete document before filling the editor for asset change rows', async () => {
    mockGetAdminDocument.mockResolvedValue({
      document: {
        _id: 'change-1',
        type: 'deposit',
        amount: 1000,
        beforeAmount: 5000,
        afterAmount: 6000,
        reason: '工资到账',
        operatorOpenid: 'allowed-openid',
        createdAt: '2026-07-28T00:00:00Z'
      }
    });
    const instance = page();
    instance.setData({
      authorized: true,
      selectedCollection: 'asset_changes',
      documents: [{ _id: 'change-1', reason: '工资到账' }]
    });

    await instance.selectDocument({ currentTarget: { dataset: { id: 'change-1' } } });

    expect(mockGetAdminDocument).toHaveBeenCalledWith('asset_changes', 'change-1');
    expect(instance.data.selectedId).toBe('change-1');
    expect(JSON.parse(instance.data.editorText)).toEqual({
      type: 'deposit',
      amount: 1000,
      beforeAmount: 5000,
      afterAmount: 6000,
      reason: '工资到账',
      operatorOpenid: 'allowed-openid',
      createdAt: '2026-07-28T00:00:00Z'
    });
  });

  test.each([
    ['ADMIN_DENIED', '无管理员权限'],
    ['COLLECTION_NOT_ALLOWED', '集合不允许操作'],
    ['DOCUMENT_ID_REQUIRED', '请输入文档 ID'],
    ['DOCUMENT_NOT_FOUND', '文档不存在'],
    ['JSON_INVALID', 'JSON 格式不正确'],
    ['DATA_INVALID', '数据必须是对象'],
    ['UNKNOWN_ACTION', '未知操作']
  ])('maps %s to its specified Chinese message', async (code, message) => {
    mockCreateAdminDocument.mockRejectedValue(new Error(code));
    const instance = page();
    instance.setData({ editorText: '{}', selectedCollection: 'projects' });

    await instance.createDocument();

    expect(global.wx.showToast).toHaveBeenCalledWith({ title: message, icon: 'none' });
  });

  test('updates the selected document with parsed JSON', async () => {
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"更新项目"}'
    });
    await instance.updateDocument();
    expect(mockUpdateAdminDocument).toHaveBeenCalledWith(
      'projects', 'project-1', { name: '更新项目' }
    );
  });

  test('requires explicit overwrite confirmation', async () => {
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"覆盖项目"}'
    });
    instance.setDocument();
    await flushPromises();
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '覆盖文档',
      confirmText: '确认覆盖'
    }));
    expect(mockSetAdminDocument).toHaveBeenCalledWith(
      'projects', 'project-1', { name: '覆盖项目' }
    );
  });

  test('fetches the latest snapshot before delete confirmation', async () => {
    const instance = page();
    instance.setData({ selectedCollection: 'projects', selectedId: 'project-1' });
    instance.removeDocument();
    await flushPromises();
    expect(mockGetAdminDocument).toHaveBeenCalledWith('projects', 'project-1');
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除文档',
      confirmText: '确认删除',
      content: expect.stringContaining('华泰稳健一号')
    }));
    expect(mockRemoveAdminDocument).toHaveBeenCalledWith('projects', 'project-1');
  });
});
