let documents;
let currentOpenid;

function resetDocuments() {
  documents = {
    users: [
      { _id: 'user-1', openid: 'allowed-openid', nickname: '成员一', enabled: true },
      { _id: 'user-2', openid: 'second-openid', nickname: '成员二', enabled: true }
    ],
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
      let sortKey;
      let sortDirection;
      let offset = 0;
      let max = 20;
      const query = {
        orderBy(key, direction) {
          sortKey = key;
          sortDirection = direction;
          return query;
        },
        skip(value) {
          offset = value;
          return query;
        },
        limit(value) {
          max = value;
          return query;
        },
        async get() {
          const data = collection.filter((document) => matches(document, filters)).slice();
          if (sortKey) {
            data.sort((left, right) => (
              sortDirection === 'desc'
                ? String(right[sortKey]).localeCompare(String(left[sortKey]))
                : String(left[sortKey]).localeCompare(String(right[sortKey]))
            ));
          }
          return { data: data.slice(offset, offset + max) };
        }
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

test('defaults a new project registrant to the caller', async () => {
  await expect(main({ action: 'create', project }))
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

test('accepts either enabled family member as registrant and rejects other OpenIDs', async () => {
  await expect(main({ action: 'create', project: { ...project, registrantOpenid: 'second-openid' } }))
    .resolves.toEqual({ ok: true, project: expect.objectContaining({ registrantOpenid: 'second-openid' }) });

  await expect(main({ action: 'create', project: { ...project, registrantOpenid: 'spoofed' } }))
    .rejects.toThrow('REGISTRANT_INVALID');
  expect(documents.projects).toHaveLength(1);
});

test('rejects unauthorized callers before accessing projects', async () => {
  currentOpenid = 'denied-openid';

  await expect(main({ action: 'list' })).rejects.toThrow('AUTH_DENIED');
  expect(documents.projects).toEqual([]);
});

test('updates editable fields and accepts the second enabled registrant', async () => {
  const created = await main({ action: 'create', project });

  await expect(main({ action: 'update', id: created.project._id, project: {
    ...project,
    name: '更新后的项目',
    registrantOpenid: 'second-openid'
  } })).resolves.toEqual({ ok: true, project: expect.objectContaining({ name: '更新后的项目' }) });

  expect(documents.projects[0].registrantOpenid).toBe('second-openid');
});

test('lists the two enabled users for registrant selection', async () => {
  await expect(main({ action: 'listUsers' })).resolves.toEqual({
    ok: true,
    users: [
      { openid: 'allowed-openid', nickname: '成员一', role: '' },
      { openid: 'second-openid', nickname: '成员二', role: '' }
    ]
  });
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

test('allows negative actual return components when redeeming a realized loss', async () => {
  const created = await main({ action: 'create', project });

  await expect(main({ action: 'redeem', id: created.project._id, redeemData: {
    redeemDate: '2026-07-28',
    actualInterest: -20,
    actualFixedReward: -100
  } })).resolves.toEqual({ ok: true, project: expect.objectContaining({
    actualInterest: -20,
    actualFixedReward: -100,
    manualStatus: 'redeemed'
  }) });

  expect(documents.projects[0]).toEqual(expect.objectContaining({
    actualInterest: -20,
    actualFixedReward: -100
  }));
});

test('corrects redeemed raw fields without changing the redemption status', async () => {
  const created = await main({ action: 'create', project });
  await main({ action: 'redeem', id: created.project._id, redeemData: {
    redeemDate: '2026-07-28', actualInterest: 20, actualFixedReward: 100
  } });

  await expect(main({ action: 'correctRedemption', id: created.project._id, redeemData: {
    redeemDate: '2026-07-30', actualInterest: -30, actualFixedReward: 150
  } })).resolves.toEqual({ ok: true, project: expect.objectContaining({
    manualStatus: 'redeemed',
    redeemDate: '2026-07-30',
    actualInterest: -30,
    actualFixedReward: 150
  }) });

  expect(documents.projects[0]).toEqual(expect.objectContaining({
    manualStatus: 'redeemed',
    redeemDate: '2026-07-30',
    actualInterest: -30,
    actualFixedReward: 150
  }));
});

test('lists enabled categories and applies server-safe project filters', async () => {
  documents.categories.push({ _id: 'category-2', name: '停用品类', enabled: false, sortOrder: 2 });
  await main({ action: 'create', project });
  documents.projects.push({ _id: 'projects-other', ...project, registrantOpenid: 'other-openid', manualStatus: 'active' });

  await expect(main({ action: 'listCategories' })).resolves.toEqual({
    ok: true,
    categories: [expect.objectContaining({ _id: 'category-1' })]
  });
  await expect(main({ action: 'list', categoryId: 'category-1', registrantOpenid: 'allowed-openid' }))
    .resolves.toEqual({ ok: true, projects: [expect.objectContaining({ _id: 'projects-1' })] });
});

test('lists every matching project across database pages in end-date order', async () => {
  documents.projects = Array.from({ length: 25 }, (_, index) => ({
    _id: `project-${index + 1}`,
    registrantOpenid: 'allowed-openid',
    manualStatus: 'active',
    categoryId: 'category-1',
    endDate: `2026-08-${String(25 - index).padStart(2, '0')}`
  }));

  await expect(main({ action: 'list', registrantOpenid: 'allowed-openid' })).resolves.toEqual({
    ok: true,
    projects: expect.arrayContaining([expect.objectContaining({ _id: 'project-25' })])
  });

  const result = await main({ action: 'list', registrantOpenid: 'allowed-openid' });
  expect(result.projects).toHaveLength(25);
  expect(result.projects.map((item) => item.endDate)).toEqual([
    ...result.projects.map((item) => item.endDate).slice().sort()
  ]);
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
