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
        principal: 10000,
        startDate: '2026-07-01',
        redeemDate: '2026-07-28',
        actualInterest: 23.01,
        actualFixedReward: 200
      },
      {
        _id: 'project-2',
        registrantOpenid: 'other-openid',
        manualStatus: 'redeemed',
        principal: 5000,
        startDate: '2025-12-01',
        redeemDate: '2025-12-31',
        actualInterest: 100,
        actualFixedReward: 0
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
      annualizedRate: expect.closeTo(0.2907095, 6),
      fixedRewardShare: expect.closeTo(0.8968208, 6),
      monthly: [{ month: '2026-07', amount: 223.01 }],
      byRegistrant: [{
        registrantOpenid: 'allowed-openid',
        projectCount: 1,
        principal: 10000,
        actualTotalReturn: 223.01
      }]
    }
  });
});

test('includes redeemed projects from every annual statistics query page', async () => {
  documents.projects = Array.from({ length: 21 }, (_, index) => ({
    _id: `project-${index + 1}`,
    registrantOpenid: index < 20 ? 'allowed-openid' : 'other-openid',
    manualStatus: 'redeemed',
    principal: 100,
    startDate: '2026-01-01',
    redeemDate: '2026-01-01',
    actualInterest: 10,
    actualFixedReward: 5
  }));

  await expect(main({ action: 'annual', year: 2026 })).resolves.toEqual({
    ok: true,
    stats: {
      year: 2026,
      totalReturn: 315,
      annualizedRate: 54.75,
      fixedRewardShare: expect.closeTo(1 / 3, 10),
      monthly: [{ month: '2026-01', amount: 315 }],
      byRegistrant: [
        {
          registrantOpenid: 'allowed-openid',
          projectCount: 20,
          principal: 2000,
          actualTotalReturn: 300
        },
        {
          registrantOpenid: 'other-openid',
          projectCount: 1,
          principal: 100,
          actualTotalReturn: 15
        }
      ]
    }
  });
});

test('rejects disabled callers and invalid enabled-user configuration', async () => {
  currentOpenid = 'denied-openid';
  await expect(main({ action: 'annual', year: 2026 })).rejects.toThrow('AUTH_DENIED');

  documents.users.push({ _id: 'user-3', openid: 'third-openid', enabled: true });
  await expect(main({ action: 'annual', year: 2026 })).rejects.toThrow('AUTH_CONFIG_INVALID');
});
