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
  const readDocumentById = (id) => {
    if (Array.isArray(collection)) {
      return collection.find((document) => document._id === id);
    }
    return collection[id];
  };

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
    orderBy(key, direction) {
      return {
        async get() {
          const data = Object.values(collection).slice().sort((left, right) => (
            direction === 'desc'
              ? String(right[key]).localeCompare(String(left[key]))
              : String(left[key]).localeCompare(String(right[key]))
          ));
          return { data };
        }
      };
    },
    doc(id) {
      return {
        async get() {
          if (documentGetError) {
            throw documentGetError;
          }
          const document = readDocumentById(id);
          if (!document) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
          return { data: document };
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
      const _id = `${name}-${store[name].length + 1}`;
      store[name].push({ _id, ...data });
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

test('returns the default asset amount when cloud sdk reports a missing document message', async () => {
  documentGetError = new Error('document.get:fail document with _id current does not exist');

  await expect(main({ action: 'get' })).resolves.toEqual({
    ok: true,
    asset: { totalAmount: 0 }
  });
});

test('deposits into the current family asset and records the change', async () => {
  await expect(main({
    action: 'update',
    type: 'deposit',
    amount: 50000,
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
    type: 'deposit',
    amount: 50000,
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
    type: 'deposit',
    amount: 10000,
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
  'rejects invalid asset change amount %p before writing',
  async (amount) => {
    await expect(main({ action: 'update', type: 'deposit', amount, reason: '资产调整' })).rejects.toThrow('ASSET_AMOUNT_INVALID');
    expect(documents.family_assets).toEqual({});
    expect(documents.asset_changes).toEqual([]);
  }
);

test.each([50000, '50000', '50000.25'])(
  'accepts numeric deposit amount %p',
  async (amount) => {
    await expect(main({ action: 'update', type: 'deposit', amount, reason: '资产调整' })).resolves.toEqual({
      ok: true,
      asset: expect.objectContaining({ totalAmount: Number(amount) })
    });
  }
);

test.each([
  undefined,
  null,
  '',
  '   ',
  '1'.repeat(101),
  123,
  true,
  [],
  {}
])(
  'rejects invalid asset update reason %p before writing',
  async (reason) => {
    await expect(main({ action: 'update', type: 'deposit', amount: 50000, reason })).rejects.toThrow('ASSET_REASON_INVALID');
    expect(documents.family_assets).toEqual({});
    expect(documents.asset_changes).toEqual([]);
  }
);

test('trims the asset update reason before recording the audit row', async () => {
  await expect(main({ action: 'update', type: 'deposit', amount: 50000, reason: '  工资到账  ' })).resolves.toEqual({
    ok: true,
    asset: expect.objectContaining({ totalAmount: 50000 })
  });

  expect(documents.asset_changes[0].reason).toBe('工资到账');
});

test('withdraws from the current family asset and records the change', async () => {
  documents.family_assets.current = { _id: 'current', totalAmount: 50000 };

  await expect(main({ action: 'update', type: 'withdraw', amount: 12000, reason: '转出备用' })).resolves.toEqual({
    ok: true,
    asset: expect.objectContaining({ totalAmount: 38000 })
  });

  expect(documents.asset_changes).toEqual([expect.objectContaining({
    type: 'withdraw',
    amount: 12000,
    beforeAmount: 50000,
    afterAmount: 38000,
    reason: '转出备用'
  })]);
});

test('repays part of a deposit and links the repayment to the source deposit', async () => {
  documents.family_assets.current = { _id: 'current', totalAmount: 50000 };
  documents.asset_changes = [
    {
      _id: 'deposit-1',
      type: 'deposit',
      amount: 10000,
      beforeAmount: 40000,
      afterAmount: 50000,
      reason: '耶南存入',
      createdAt: '2026-07-22T00:00:00Z'
    }
  ];

  await expect(main({
    action: 'repay',
    depositId: 'deposit-1',
    amount: 3000,
    reason: '归还耶南'
  })).resolves.toEqual({
    ok: true,
    asset: expect.objectContaining({ _id: 'current', totalAmount: 47000 }),
    change: expect.objectContaining({
      type: 'repay',
      amount: 3000,
      relatedDepositId: 'deposit-1',
      beforeAmount: 50000,
      afterAmount: 47000,
      reason: '归还耶南'
    })
  });

  expect(documents.family_assets.current.totalAmount).toBe(47000);
  expect(documents.asset_changes).toEqual([
    expect.objectContaining({ _id: 'deposit-1' }),
    expect.objectContaining({
      type: 'repay',
      amount: 3000,
      relatedDepositId: 'deposit-1',
      beforeAmount: 50000,
      afterAmount: 47000,
      reason: '归还耶南',
      operatorOpenid: 'allowed-openid',
      createdAt: 'server-date'
    })
  ]);
  expect(transactionRuns).toBe(1);
});

test('rejects repayments above the selected deposit outstanding amount', async () => {
  documents.family_assets.current = { _id: 'current', totalAmount: 50000 };
  documents.asset_changes = [
    { _id: 'deposit-1', type: 'deposit', amount: 10000, beforeAmount: 40000, afterAmount: 50000, reason: '耶南存入', createdAt: '2026-07-22T00:00:00Z' },
    { _id: 'repay-1', type: 'repay', amount: 8000, relatedDepositId: 'deposit-1', beforeAmount: 50000, afterAmount: 42000, reason: '归还耶南', createdAt: '2026-07-23T00:00:00Z' }
  ];

  await expect(main({
    action: 'repay',
    depositId: 'deposit-1',
    amount: 3000,
    reason: '再次归还'
  })).rejects.toThrow('ASSET_REPAY_AMOUNT_EXCEEDS_OUTSTANDING');

  expect(documents.family_assets.current.totalAmount).toBe(50000);
  expect(documents.asset_changes).toHaveLength(2);
});

test('rejects withdraws that would make family assets negative', async () => {
  documents.family_assets.current = { _id: 'current', totalAmount: 5000 };

  await expect(main({ action: 'update', type: 'withdraw', amount: 6000, reason: '超额支取' }))
    .rejects.toThrow('ASSET_BALANCE_INSUFFICIENT');

  expect(documents.family_assets.current.totalAmount).toBe(5000);
  expect(documents.asset_changes).toEqual([]);
});

test.each([undefined, null, '', 'transfer', 'DEPOSIT'])('rejects invalid asset change type %p before writing', async (type) => {
  await expect(main({ action: 'update', type, amount: 1000, reason: '资产调整' })).rejects.toThrow('ASSET_CHANGE_TYPE_INVALID');
  expect(documents.family_assets).toEqual({});
  expect(documents.asset_changes).toEqual([]);
});

test('lists all asset changes in newest-first order', async () => {
  documents.asset_changes = [
    { _id: 'old', type: 'deposit', amount: 1000, beforeAmount: 0, afterAmount: 1000, reason: '旧记录', createdAt: '2026-07-21T00:00:00Z' },
    { _id: 'new', type: 'withdraw', amount: 300, beforeAmount: 1000, afterAmount: 700, reason: '新记录', createdAt: '2026-07-22T00:00:00Z' }
  ];

  await expect(main({ action: 'listChanges' })).resolves.toEqual({
    ok: true,
    changes: [
      expect.objectContaining({ _id: 'new' }),
      expect.objectContaining({ _id: 'old' })
    ]
  });
});

test('decorates deposits with repaid and outstanding amounts when listing changes', async () => {
  documents.asset_changes = [
    { _id: 'deposit-1', type: 'deposit', amount: 10000, beforeAmount: 0, afterAmount: 10000, reason: '耶南存入', createdAt: '2026-07-21T00:00:00Z' },
    { _id: 'repay-1', type: 'repay', amount: 3000, relatedDepositId: 'deposit-1', beforeAmount: 10000, afterAmount: 7000, reason: '归还耶南', createdAt: '2026-07-22T00:00:00Z' }
  ];

  await expect(main({ action: 'listChanges' })).resolves.toEqual({
    ok: true,
    changes: [
      expect.objectContaining({ _id: 'repay-1' }),
      expect.objectContaining({
        _id: 'deposit-1',
        repaidAmount: 3000,
        outstandingAmount: 7000,
        repayable: true
      })
    ]
  });
});
