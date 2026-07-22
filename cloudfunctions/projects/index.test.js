let documents;
let currentOpenid;

function resetDocuments() {
  documents = {
    users: [{ _id: 'user-1', openid: 'allowed-openid', enabled: true }],
    categories: [{ _id: 'category-1', name: '银行理财', enabled: true, sortOrder: 1 }],
    projects: []
  };
  currentOpenid = 'allowed-openid';
}

function matches(document, filters) {
  return Object.entries(filters).every(([key, value]) => document[key] === value);
}

function createCollection(name) {
  const collection = documents[name];

  return {
    where(filters) {
      const query = {
        _documents: () => collection.filter((document) => matches(document, filters)),
        orderBy(key, direction) {
          return {
            get: async () => ({
              data: query._documents().slice().sort((left, right) => (
                direction === 'desc'
                  ? String(right[key]).localeCompare(String(left[key]))
                  : String(left[key]).localeCompare(String(right[key]))
              ))
            })
          };
        },
        limit(limit) {
          return { get: async () => ({ data: query._documents().slice(0, limit) }) };
        },
        get: async () => ({ data: query._documents() })
      };
      return query;
    },
    doc(id) {
      return {
        async get() {
          const document = collection.find((item) => item._id === id);
          if (!document) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
          return { data: document };
        },
        async update({ data }) {
          const document = collection.find((item) => item._id === id);
          if (!document) throw new Error('PROJECT_NOT_FOUND');
          Object.assign(document, data);
        },
        async remove() {
          const index = collection.findIndex((item) => item._id === id);
          if (index < 0) throw new Error('PROJECT_NOT_FOUND');
          collection.splice(index, 1);
        }
      };
    },
    async add({ data }) {
      const _id = `${name}-${collection.length + 1}`;
      collection.push({ _id, ...data });
      return { _id };
    }
  };
}

const mockCloud = {
  DYNAMIC_CURRENT_ENV: 'current',
  init() {},
  getWXContext() {
    return { OPENID: currentOpenid };
  },
  database() {
    return {
      collection: createCollection,
      serverDate() {
        return 'server-date';
      }
    };
  }
};

jest.mock('wx-server-sdk', () => mockCloud, { virtual: true });

const { main } = require('./index');

beforeEach(resetDocuments);

const project = {
  name: '28 天理财',
  categoryId: 'category-1',
  principal: 10000,
  startDate: '2026-07-01',
  endDate: '2026-07-28',
  expectedAnnualRate: 0.03,
  expectedInterest: 23.01,
  fixedReward: 200
};

test('creates a project with the server identity as registrant', async () => {
  await expect(main({ action: 'create', project: { ...project, registrantOpenid: 'spoofed' } }))
    .resolves.toEqual({ ok: true, project: expect.objectContaining({
      _id: 'projects-1',
      registrantOpenid: 'allowed-openid',
      manualStatus: 'active'
    }) });

  expect(documents.projects[0]).toEqual(expect.objectContaining({
    registrantOpenid: 'allowed-openid',
    expectedInterest: 23.01,
    fixedReward: 200
  }));
});

test('rejects unauthorized callers before accessing projects', async () => {
  currentOpenid = 'denied-openid';

  await expect(main({ action: 'list' })).rejects.toThrow('AUTH_DENIED');
  expect(documents.projects).toEqual([]);
});

test('updates editable fields without allowing registrant identity changes', async () => {
  const created = await main({ action: 'create', project });

  await expect(main({ action: 'update', id: created.project._id, project: {
    ...project,
    name: '更新后的项目',
    registrantOpenid: 'spoofed'
  } })).resolves.toEqual({ ok: true, project: expect.objectContaining({ name: '更新后的项目' }) });

  expect(documents.projects[0].registrantOpenid).toBe('allowed-openid');
});

test('redeems using the stored start date and rejects dates before it', async () => {
  const created = await main({ action: 'create', project });

  await expect(main({ action: 'redeem', id: created.project._id, redeemData: {
    redeemDate: '2026-06-30',
    actualInterest: 20,
    actualFixedReward: 100
  } })).rejects.toThrow('REDEEM_DATE_INVALID');

  await expect(main({ action: 'redeem', id: created.project._id, redeemData: {
    redeemDate: '2026-07-28',
    actualInterest: 20,
    actualFixedReward: 100
  } })).resolves.toEqual({ ok: true, project: expect.objectContaining({
    manualStatus: 'redeemed',
    redeemDate: '2026-07-28'
  }) });
});

test('lists enabled categories and applies server-safe project filters', async () => {
  documents.categories.push({ _id: 'category-2', name: '停用品类', enabled: false, sortOrder: 2 });
  await main({ action: 'create', project });

  await expect(main({ action: 'listCategories' })).resolves.toEqual({
    ok: true,
    categories: [expect.objectContaining({ _id: 'category-1' })]
  });
  await expect(main({ action: 'list', categoryId: 'category-1', registrantOpenid: 'spoofed' }))
    .resolves.toEqual({ ok: true, projects: [expect.objectContaining({ _id: 'projects-1' })] });
});

test('cancels active projects and removes an existing project', async () => {
  const created = await main({ action: 'create', project });

  await expect(main({ action: 'cancel', id: created.project._id })).resolves.toEqual({ ok: true });
  expect(documents.projects[0].manualStatus).toBe('cancelled');
  await expect(main({ action: 'redeem', id: created.project._id, redeemData: {
    redeemDate: '2026-07-28'
  } })).rejects.toThrow('PROJECT_NOT_ACTIVE');

  await expect(main({ action: 'remove', id: created.project._id })).resolves.toEqual({ ok: true });
  expect(documents.projects).toEqual([]);
});
