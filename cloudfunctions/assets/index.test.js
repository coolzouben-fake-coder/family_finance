let documents;
let currentOpenid;
let documentGetError;
let assetChangeAddError;
let transactionRuns;

function resetDocuments() {
  documents = {
    users: [{ openid: 'allowed-openid', enabled: true }],
    family_assets: {},
    asset_changes: []
  };
  currentOpenid = 'allowed-openid';
  documentGetError = null;
  assetChangeAddError = null;
  transactionRuns = 0;
}

function createCollection(name, store = documents) {
  const collection = store[name];

  return {
    where(filters) {
      const getMatchingDocuments = () => Object.values(collection).filter((document) => (
        Object.entries(filters).every(([key, value]) => document[key] === value)
      ));

      return {
        async get() {
          return { data: getMatchingDocuments() };
        },
        limit() {
          return {
            async get() {
              return {
                data: getMatchingDocuments().slice(0, 1)
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
          if (documentGetError) {
            throw documentGetError;
          }
          if (!collection[id]) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
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
      if (name === 'asset_changes' && assetChangeAddError) throw assetChangeAddError;
      store[name].push({ _id: `${name}-${store[name].length + 1}`, ...data });
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
      },
      async runTransaction(handler) {
        transactionRuns += 1;
        const transactionDocuments = JSON.parse(JSON.stringify(documents));
        const result = await handler({
          collection(name) {
            return createCollection(name, transactionDocuments);
          }
        });
        documents = transactionDocuments;
        return result;
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
  expect(transactionRuns).toBe(1);
});

test('rolls back the asset update when the audit write fails', async () => {
  documents.family_assets.current = { _id: 'current', totalAmount: 40000 };
  assetChangeAddError = new Error('audit write failed');

  await expect(main({
    action: 'update',
    totalAmount: 50000,
    reason: '工资到账'
  })).rejects.toThrow('audit write failed');

  expect(documents.family_assets.current.totalAmount).toBe(40000);
  expect(documents.asset_changes).toEqual([]);
  expect(transactionRuns).toBe(1);
});

test('rejects denied access before reading or writing assets', async () => {
  currentOpenid = 'denied-openid';

  await expect(main({ action: 'get' })).rejects.toThrow('AUTH_DENIED');
  expect(documents.family_assets).toEqual({});
  expect(documents.asset_changes).toEqual([]);
});

test('rejects access when more than two enabled users are configured', async () => {
  documents.users.push(
    { openid: 'second-openid', enabled: true },
    { openid: 'third-openid', enabled: true }
  );

  await expect(main({ action: 'get' })).rejects.toThrow('AUTH_CONFIG_INVALID');
  expect(documents.family_assets).toEqual({});
  expect(documents.asset_changes).toEqual([]);
});

test('propagates non-missing asset database errors', async () => {
  documentGetError = Object.assign(new Error('database unavailable'), {
    errCode: 'DATABASE_UNAVAILABLE'
  });

  await expect(main({ action: 'get' })).rejects.toThrow('database unavailable');
});

test.each([
  undefined,
  null,
  '',
  '   ',
  'abc',
  '9'.repeat(400),
  true,
  false,
  [],
  [50000],
  {},
  NaN,
  Infinity,
  -Infinity,
  -1
])(
  'rejects invalid total amount %p before writing',
  async (totalAmount) => {
    await expect(main({ action: 'update', totalAmount })).rejects.toThrow('TOTAL_AMOUNT_INVALID');
    expect(documents.family_assets).toEqual({});
    expect(documents.asset_changes).toEqual([]);
  }
);

test.each([50000, '50000', '50000.25'])(
  'accepts numeric total amount %p',
  async (totalAmount) => {
    await expect(main({ action: 'update', totalAmount })).resolves.toEqual({
      ok: true,
      asset: expect.objectContaining({ totalAmount: Number(totalAmount) })
    });
  }
);
