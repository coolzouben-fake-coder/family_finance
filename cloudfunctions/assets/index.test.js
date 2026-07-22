let documents;
let currentOpenid;

function resetDocuments() {
  documents = {
    users: [{ openid: 'allowed-openid', enabled: true }],
    family_assets: {},
    asset_changes: []
  };
  currentOpenid = 'allowed-openid';
}

function createCollection(name) {
  const collection = documents[name];

  return {
    where(query) {
      return {
        limit() {
          return {
            async get() {
              return {
                data: Object.values(collection).filter((document) => (
                  Object.entries(query).every(([key, value]) => document[key] === value)
                )).slice(0, 1)
              };
            }
          };
        }
      };
    },
    limit() {
      return {
        async get() {
          return { data: Object.values(collection).slice(0, 1) };
        }
      };
    },
    doc(id) {
      return {
        async get() {
          return { data: collection[id] };
        },
        async set({ data }) {
          collection[id] = { _id: id, ...data };
        },
        async update({ data }) {
          Object.assign(collection[id], data);
        }
      };
    },
    async add({ data }) {
      documents[name].push({ _id: `${name}-${documents[name].length + 1}`, ...data });
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

test('gets the fixed current asset document for an allowed user', async () => {
  documents.family_assets.legacy = { _id: 'legacy', totalAmount: 99999 };
  documents.family_assets.current = { _id: 'current', totalAmount: 50000 };

  await expect(main({ action: 'get' })).resolves.toEqual({
    ok: true,
    asset: { _id: 'current', totalAmount: 50000 }
  });
});

test('returns the default asset amount when the singleton does not exist', async () => {
  await expect(main({ action: 'get' })).resolves.toEqual({
    ok: true,
    asset: { totalAmount: 0 }
  });
});

test('updates the current family asset and records the change', async () => {
  await expect(main({
    action: 'update',
    totalAmount: 50000,
    reason: '初始资产'
  })).resolves.toEqual({
    ok: true,
    asset: expect.objectContaining({ _id: 'current', totalAmount: 50000 })
  });

  expect(documents.family_assets).toEqual({
    current: expect.objectContaining({
      _id: 'current',
      totalAmount: 50000,
      updatedByOpenid: 'allowed-openid',
      updatedAt: 'server-date'
    })
  });
  expect(documents.asset_changes).toEqual([expect.objectContaining({
    beforeAmount: 0,
    afterAmount: 50000,
    reason: '初始资产',
    operatorOpenid: 'allowed-openid',
    createdAt: 'server-date'
  })]);
});

test('rejects denied access before reading or writing assets', async () => {
  currentOpenid = 'denied-openid';

  await expect(main({ action: 'get' })).rejects.toThrow('AUTH_DENIED');
  expect(documents.family_assets).toEqual({});
  expect(documents.asset_changes).toEqual([]);
});

test.each([undefined, 'abc', Infinity, -1])(
  'rejects invalid total amount %p before writing',
  async (totalAmount) => {
    await expect(main({ action: 'update', totalAmount })).rejects.toThrow('TOTAL_AMOUNT_INVALID');
    expect(documents.family_assets).toEqual({});
    expect(documents.asset_changes).toEqual([]);
  }
);
