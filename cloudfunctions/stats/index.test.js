let documents;
let currentOpenid;

function resetDocuments() {
  documents = {
    users: [
      { _id: 'user-1', openid: 'allowed-openid', enabled: true },
      { _id: 'user-2', openid: 'other-openid', enabled: true }
    ],
    projects: [
      {
        _id: 'project-1',
        registrantOpenid: 'allowed-openid',
        manualStatus: 'redeemed',
        principalStatus: 'released',
        rewardStatus: 'received',
        categoryId: 'category-1',
        principal: 10000,
        startDate: '2026-07-01',
        redeemDate: '2026-07-28',
        rewardReceivedDate: '2026-07-28',
        actualInterest: 23.01,
        actualFixedReward: 200
      },
      {
        _id: 'project-2',
        registrantOpenid: 'other-openid',
        manualStatus: 'redeemed',
        principalStatus: 'released',
        rewardStatus: 'received',
        categoryId: 'category-2',
        principal: 5000,
        startDate: '2025-12-01',
        redeemDate: '2025-12-31',
        rewardReceivedDate: '2025-12-31',
        actualInterest: 100,
        actualFixedReward: 0
      }
    ],
    family_assets: [
      { _id: 'current', totalAmount: 20000 }
    ],
    asset_changes: [
      {
        _id: 'asset-change-1',
        type: 'deposit',
        amount: 20000,
        beforeAmount: 0,
        afterAmount: 20000,
        createdAt: '2025-12-01'
      }
    ]
  };
  currentOpenid = 'allowed-openid';
}

function matches(document, filters) {
  return Object.entries(filters).every(([key, value]) => {
    if (value && value.type === 'range') {
      return document[key] >= value.start && document[key] <= value.end;
    }
    return document[key] === value;
  });
}

function createCollection(name) {
  return {
    doc(id) {
      return {
        async get() {
          const document = documents[name].find((item) => item._id === id);
          if (!document) throw new Error('document.get:fail does not exist');
          return { data: document };
        }
      };
    },
    where(filters) {
      let offset = 0;
      let max = 20;
      const query = {
        skip(value) {
          offset = value;
          return query;
        },
        limit(value) {
          max = value;
          return query;
        },
        async get() {
          return {
            data: documents[name]
              .filter((document) => matches(document, filters))
              .slice(offset, offset + max)
          };
        }
      };
      return query;
    },
    orderBy(field, direction) {
      const query = {
        async get() {
          const sorted = [...documents[name]].sort((left, right) => {
            const result = String(left[field]).localeCompare(String(right[field]));
            return direction === 'desc' ? -result : result;
          });
          return { data: sorted };
        }
      };
      return query;
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
      command: {
        gte(start) {
          return {
            and({ value: end }) {
              return { type: 'range', start, end };
            }
          };
        },
        lte(value) {
          return { value };
        }
      }
    };
  }
};

jest.mock('wx-server-sdk', () => mockCloud, { virtual: true });

const { main } = require('./index');

beforeEach(resetDocuments);

test('calculates annual statistics using inclusive holding days', async () => {
  await expect(main({ action: 'annual', year: 2026 })).resolves.toEqual({
    ok: true,
    stats: {
      year: 2026,
      totalReturn: 223.01,
      actualInterestTotal: 23.01,
      actualFixedRewardTotal: 200,
      annualizedRate: expect.closeTo(0.2907095, 6),
      familyAssetReturnRate: expect.closeTo(223.01 / 20000, 10),
      averageFamilyAssets: 20000,
      interestShare: expect.closeTo(0.1031792, 6),
      fixedRewardShare: expect.closeTo(0.8968208, 6),
      monthly: [{ month: '2026-07', amount: 223.01 }],
      byCategory: [{
        categoryId: 'category-1',
        projectCount: 1,
        principal: 10000,
        actualTotalReturn: 223.01,
        share: 1
      }],
      byRegistrant: [{
        registrantOpenid: 'allowed-openid',
        projectCount: 1,
        principal: 10000,
        actualTotalReturn: 223.01,
        annualizedRate: expect.closeTo(0.2907095, 6)
      }]
    }
  });
});

test('ignores expected return fields when calculating actual annualized statistics', async () => {
  documents.projects[0] = {
    ...documents.projects[0],
    expectedReturnMode: 'fixedReturn',
    expectedInterest: 999999,
    expectedFixedReturn: 999999,
    fixedReward: 999999
  };

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.totalReturn).toBe(223.01);
  expect(result.stats.annualizedRate).toBeCloseTo(0.2907095, 6);
});

test('counts received rewards even when principal is still active without annualizing', async () => {
  documents.projects[0] = {
    ...documents.projects[0],
    manualStatus: 'active',
    principalStatus: 'holding',
    rewardStatus: 'received',
    rewardReceivedDate: '2026-07-20',
    redeemDate: ''
  };

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.totalReturn).toBe(200);
  expect(result.stats.actualInterestTotal).toBe(0);
  expect(result.stats.actualFixedRewardTotal).toBe(200);
  expect(result.stats.monthly).toEqual([{ month: '2026-07', amount: 200 }]);
  expect(result.stats.annualizedRate).toBe(0);
  expect(result.stats.familyAssetReturnRate).toBeCloseTo(0.01, 10);
  expect(result.stats.byRegistrant[0].annualizedRate).toBe(0);
});

test('excludes reward-only active projects from project annualized rate until principal is released', async () => {
  documents.projects[0] = {
    ...documents.projects[0],
    manualStatus: 'active',
    principalStatus: 'holding',
    rewardStatus: 'received',
    rewardReceivedDate: '2026-07-20',
    redeemDate: '',
    actualInterest: 0,
    actualFixedReward: 200
  };
  documents.projects.push({
    _id: 'released-project',
    registrantOpenid: 'allowed-openid',
    manualStatus: 'redeemed',
    principalStatus: 'released',
    rewardStatus: 'received',
    categoryId: 'category-1',
    principal: 10000,
    startDate: '2026-01-01',
    redeemDate: '2026-01-10',
    rewardReceivedDate: '2026-01-10',
    actualInterest: 100,
    actualFixedReward: 0
  });

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.totalReturn).toBe(300);
  expect(result.stats.annualizedRate).toBeCloseTo(100 / (10000 * 10) * 365, 10);
  expect(result.stats.byRegistrant[0].annualizedRate).toBeCloseTo(100 / (10000 * 10) * 365, 10);
});

test('calculates household asset return rate from weighted average family assets', async () => {
  documents.projects = [{
    _id: 'released-project',
    registrantOpenid: 'allowed-openid',
    manualStatus: 'redeemed',
    principalStatus: 'released',
    rewardStatus: 'received',
    categoryId: 'category-1',
    principal: 10000,
    startDate: '2026-01-01',
    redeemDate: '2026-01-10',
    rewardReceivedDate: '2026-01-10',
    actualInterest: 365,
    actualFixedReward: 0
  }];
  documents.family_assets = [{ _id: 'current', totalAmount: 20000 }];
  documents.asset_changes = [
    { _id: 'asset-before-year', beforeAmount: 0, afterAmount: 10000, createdAt: '2025-12-31' },
    { _id: 'asset-mid-year', beforeAmount: 10000, afterAmount: 20000, createdAt: '2026-07-02' }
  ];

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.averageFamilyAssets).toBeCloseTo(((10000 * 182) + (20000 * 183)) / 365, 10);
  expect(result.stats.familyAssetReturnRate).toBeCloseTo(365 / result.stats.averageFamilyAssets, 10);
});

test('splits interest and delayed reward by their own cash-flow dates while annualizing by principal redemption date', async () => {
  documents.projects[0] = {
    ...documents.projects[0],
    redeemDate: '2026-07-28',
    rewardReceivedDate: '2026-08-10'
  };

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.monthly).toEqual([
    { month: '2026-07', amount: 23.01 },
    { month: '2026-08', amount: 200 }
  ]);
  expect(result.stats.annualizedRate).toBeCloseTo(0.2907095, 6);
});

test('ignores active projects whose principal and reward are still pending', async () => {
  documents.projects[0] = {
    ...documents.projects[0],
    manualStatus: 'active',
    principalStatus: 'holding',
    rewardStatus: 'pending',
    rewardReceivedDate: ''
  };

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.totalReturn).toBe(0);
  expect(result.stats.monthly).toEqual([]);
});

test('includes redeemed projects from every annual statistics query page', async () => {
  documents.projects = Array.from({ length: 21 }, (_, index) => ({
    _id: `project-${index + 1}`,
    registrantOpenid: index < 20 ? 'allowed-openid' : 'other-openid',
    manualStatus: 'redeemed',
    principalStatus: 'released',
    rewardStatus: 'received',
    categoryId: 'category-1',
    principal: 100,
    startDate: '2026-01-01',
    redeemDate: '2026-01-01',
    rewardReceivedDate: '2026-01-01',
    actualInterest: 10,
    actualFixedReward: 5
  }));

  await expect(main({ action: 'annual', year: 2026 })).resolves.toEqual({
    ok: true,
    stats: {
      year: 2026,
      totalReturn: 315,
      actualInterestTotal: 210,
      actualFixedRewardTotal: 105,
      annualizedRate: 54.75,
      averageFamilyAssets: 20000,
      familyAssetReturnRate: 0.01575,
      interestShare: expect.closeTo(2 / 3, 10),
      fixedRewardShare: expect.closeTo(1 / 3, 10),
      monthly: [{ month: '2026-01', amount: 315 }],
      byCategory: [{
        categoryId: 'category-1',
        projectCount: 21,
        principal: 2100,
        actualTotalReturn: 315,
        share: 1
      }],
      byRegistrant: [
        {
          registrantOpenid: 'allowed-openid',
          projectCount: 20,
          principal: 2000,
          actualTotalReturn: 300,
          annualizedRate: 54.75
        },
        {
          registrantOpenid: 'other-openid',
          projectCount: 1,
          principal: 100,
          actualTotalReturn: 15,
          annualizedRate: 54.75
        }
      ]
    }
  });
});

test('uses a nonzero net-loss denominator for fixed reward share', async () => {
  documents.projects = [{
    _id: 'loss-project',
    registrantOpenid: 'allowed-openid',
    categoryId: 'category-1',
    manualStatus: 'redeemed',
    principalStatus: 'released',
    rewardStatus: 'received',
    principal: 10000,
    startDate: '2026-01-01',
    redeemDate: '2026-01-10',
    rewardReceivedDate: '2026-01-10',
    actualInterest: -150,
    actualFixedReward: 50
  }];

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.totalReturn).toBe(-100);
  expect(result.stats.actualInterestTotal).toBe(-150);
  expect(result.stats.actualFixedRewardTotal).toBe(50);
  expect(result.stats.interestShare).toBe(1.5);
  expect(result.stats.fixedRewardShare).toBe(-0.5);
  expect(result.stats.byCategory[0].share).toBe(1);
});

test('calculates category proportions from the annual total', async () => {
  documents.projects.push({
    _id: 'project-3',
    registrantOpenid: 'other-openid',
    manualStatus: 'redeemed',
    principalStatus: 'released',
    rewardStatus: 'received',
    categoryId: 'category-2',
    principal: 5000,
    startDate: '2026-07-01',
    redeemDate: '2026-07-28',
    rewardReceivedDate: '2026-07-28',
    actualInterest: 100,
    actualFixedReward: 0
  });

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.totalReturn).toBe(323.01);
  expect(result.stats.byCategory).toEqual([
    expect.objectContaining({ categoryId: 'category-1', share: expect.closeTo(223.01 / 323.01, 10) }),
    expect.objectContaining({ categoryId: 'category-2', share: expect.closeTo(100 / 323.01, 10) })
  ]);
});

test('uses safe zero shares when interest and rewards offset', async () => {
  documents.projects = [{
    _id: 'offset-project',
    registrantOpenid: 'allowed-openid',
    categoryId: 'category-1',
    manualStatus: 'redeemed',
    principalStatus: 'released',
    rewardStatus: 'received',
    principal: 10000,
    startDate: '2026-01-01',
    redeemDate: '2026-01-10',
    rewardReceivedDate: '2026-01-10',
    actualInterest: -50,
    actualFixedReward: 50
  }];

  const result = await main({ action: 'annual', year: 2026 });

  expect(result.stats.actualInterestTotal).toBe(-50);
  expect(result.stats.actualFixedRewardTotal).toBe(50);
  expect(result.stats.interestShare).toBe(0);
  expect(result.stats.fixedRewardShare).toBe(0);
  expect(result.stats.byCategory[0].share).toBe(0);
});

test('rejects disabled callers and invalid enabled-user configuration', async () => {
  currentOpenid = 'denied-openid';
  await expect(main({ action: 'annual', year: 2026 })).rejects.toThrow('AUTH_DENIED');

  documents.users.push({ _id: 'user-3', openid: 'third-openid', enabled: true });
  await expect(main({ action: 'annual', year: 2026 })).rejects.toThrow('AUTH_CONFIG_INVALID');
});
