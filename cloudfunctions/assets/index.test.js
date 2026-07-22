const documents = {
  users: [{ openid: 'allowed-openid', enabled: true }],
  family_assets: [],
  asset_changes: []
};

function createCollection(name) {
  return {
    where(query) {
      return {
        limit() {
          return {
            async get() {
              return {
                data: documents[name].filter((document) => (
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
          return { data: documents[name].slice(0, 1) };
        }
      };
    },
    doc(id) {
      return {
        async update({ data }) {
          const document = documents[name].find((item) => item._id === id);
          Object.assign(document, data);
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
    return { OPENID: 'allowed-openid' };
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

test('gets the default asset amount for an allowed user', async () => {
  await expect(main({ action: 'get' })).resolves.toEqual({
    ok: true,
    asset: { totalAmount: 0 }
  });
});

test('updates the family asset and records the change', async () => {
  await expect(main({
    action: 'update',
    totalAmount: 50000,
    reason: '初始资产'
  })).resolves.toEqual({
    ok: true,
    asset: expect.objectContaining({ totalAmount: 50000 })
  });

  expect(documents.family_assets).toEqual([expect.objectContaining({
    totalAmount: 50000,
    updatedByOpenid: 'allowed-openid',
    updatedAt: 'server-date'
  })]);
  expect(documents.asset_changes).toEqual([expect.objectContaining({
    beforeAmount: 0,
    afterAmount: 50000,
    reason: '初始资产',
    operatorOpenid: 'allowed-openid',
    createdAt: 'server-date'
  })]);
});

test('rejects invalid total assets before writing', async () => {
  await expect(main({ action: 'update', totalAmount: -1 })).rejects.toThrow('TOTAL_AMOUNT_INVALID');
  expect(documents.family_assets).toHaveLength(1);
  expect(documents.asset_changes).toHaveLength(1);
});
