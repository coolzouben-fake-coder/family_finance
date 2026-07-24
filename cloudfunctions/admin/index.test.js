let adminOpenid;
let mockCurrentOpenid;
let mockDocuments;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetDatabase() {
  mockCurrentOpenid = adminOpenid;
  mockDocuments = {
    users: [{ _id: 'user-1', openid: adminOpenid, enabled: true }],
    projects: [
      { _id: 'project-1', name: '华泰稳健一号', principal: 10000 },
      { _id: 'project-2', name: '银行存款', principal: 20000 }
    ],
    categories: [],
    family_assets: [],
    asset_changes: []
  };
}

function matches(document, filters) {
  return Object.entries(filters).every(([key, expected]) => {
    if (expected && expected.__regexp) return expected.__regexp.test(String(document[key] || ''));
    return document[key] === expected;
  });
}

function queryFor(source) {
  let offset = 0;
  let limit = 20;
  return {
    skip(value) { offset = value; return this; },
    limit(value) { limit = value; return this; },
    async get() { return { data: source.slice(offset, offset + limit) }; }
  };
}

function mockCollection(name) {
  return {
    where(filters) {
      return queryFor(mockDocuments[name].filter((item) => matches(item, filters)));
    },
    skip(value) {
      return queryFor(mockDocuments[name]).skip(value);
    },
    doc(id) {
      return {
        async get() {
          const document = mockDocuments[name].find((item) => item._id === id);
          if (!document) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
          return { data: clone(document) };
        }
      };
    }
  };
}

function mockMutableCollection(store, name) {
  return {
    doc(id) {
      return {
        async get() {
          const document = store[name].find((item) => item._id === id);
          if (!document) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
          return { data: clone(document) };
        },
        async update({ data }) {
          Object.assign(store[name].find((item) => item._id === id), clone(data));
        },
        async set({ data }) {
          const index = store[name].findIndex((item) => item._id === id);
          const replacement = { _id: id, ...clone(data) };
          if (index === -1) store[name].push(replacement);
          else store[name][index] = replacement;
        },
        async remove() {
          store[name] = store[name].filter((item) => item._id !== id);
        }
      };
    },
    async add({ data }) {
      const _id = `${name}-${store[name].length + 1}`;
      store[name].push({ _id, ...clone(data) });
      return { _id };
    }
  };
}

async function mockRunTransaction(callback) {
  const draft = clone(mockDocuments);
  const result = await callback({
    collection: (name) => mockMutableCollection(draft, name)
  });
  mockDocuments = draft;
  return { result };
}

jest.mock('wx-server-sdk', () => ({
  DYNAMIC_CURRENT_ENV: 'test',
  init: jest.fn(),
  getWXContext: () => ({ OPENID: mockCurrentOpenid }),
  database: () => ({
    collection: (name) => ({
      ...mockCollection(name),
      ...mockMutableCollection(mockDocuments, name)
    }),
    serverDate: () => 'SERVER_DATE',
    runTransaction: mockRunTransaction,
    RegExp: ({ regexp, options }) => ({
      __regexp: new RegExp(regexp, options)
    })
  })
}), { virtual: true });

describe('admin read API', () => {
  beforeEach(() => {
    jest.resetModules();
    ({ ADMIN_OPENID: adminOpenid } = require('./index').__test);
    resetDatabase();
  });

  test.each(['check', 'listCollections', 'query', 'get'])('denies a non-admin %s request', async (action) => {
    mockCurrentOpenid = 'another-openid';
    const { main } = require('./index');
    await expect(main({ action, collection: 'projects', id: 'project-1' })).rejects.toThrow('ADMIN_DENIED');
  });

  test('returns only the fixed mutable collection list', async () => {
    const { main } = require('./index');
    await expect(main({ action: 'listCollections' })).resolves.toEqual({
      ok: true,
      collections: ['users', 'projects', 'categories', 'family_assets', 'asset_changes']
    });
  });

  test('rejects a collection outside the allowlist', async () => {
    const { main } = require('./index');
    await expect(main({ action: 'query', collection: 'secrets' })).rejects.toThrow('COLLECTION_NOT_ALLOWED');
  });

  test('queries project names and caps pagination at 50', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'query', collection: 'projects', keyword: '华泰', limit: 500, offset: 0
    });
    expect(result.documents.map((item) => item._id)).toEqual(['project-1']);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  test('uses exact document lookup for non-project keywords', async () => {
    const { main } = require('./index');
    const result = await main({ action: 'query', collection: 'users', keyword: 'user-1' });
    expect(result.documents).toEqual([expect.objectContaining({ _id: 'user-1' })]);
  });

  test('returns DOCUMENT_NOT_FOUND for an absent ID', async () => {
    const { main } = require('./index');
    await expect(main({ action: 'get', collection: 'projects', id: 'missing' }))
      .rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});

describe('admin write API', () => {
  beforeEach(() => {
    jest.resetModules();
    ({ ADMIN_OPENID: adminOpenid } = require('./index').__test);
    resetDatabase();
  });

  test.each(['create', 'update', 'set', 'remove'])('denies a non-admin %s request', async (action) => {
    mockCurrentOpenid = 'another-openid';
    const { main } = require('./index');
    await expect(main({
      action, collection: 'projects', id: 'project-1', data: { name: 'changed' }
    })).rejects.toThrow('ADMIN_DENIED');
  });

  test('creates a document directly in the target collection', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'create', collection: 'categories', data: { name: '券商理财', enabled: true }
    });
    expect(result.document).toEqual(expect.objectContaining({ name: '券商理财' }));
    expect(mockDocuments.categories).toContainEqual(result.document);
  });

  test('partially updates a document directly', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'update', collection: 'projects', id: 'project-1', data: { principal: 12000 }
    });
    expect(result.document).toEqual(expect.objectContaining({
      _id: 'project-1', name: '华泰稳健一号', principal: 12000
    }));
  });

  test('rejects _id inside write data', async () => {
    const { main } = require('./index');
    await expect(main({
      action: 'update',
      collection: 'projects',
      id: 'project-1',
      data: { _id: 'replacement' }
    })).rejects.toThrow('DATA_INVALID');
  });

  test('overwrites a document directly', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'set', collection: 'projects', id: 'project-1', data: { name: '纠正后的项目' }
    });
    expect(result.document).toEqual({ _id: 'project-1', name: '纠正后的项目' });
  });

  test('removes a document directly', async () => {
    const { main } = require('./index');
    await expect(main({
      action: 'remove', collection: 'projects', id: 'project-1'
    })).resolves.toEqual({ ok: true });
    expect(mockDocuments.projects.find((item) => item._id === 'project-1')).toBeUndefined();
  });
});
