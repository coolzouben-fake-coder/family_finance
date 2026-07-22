let users;
let currentOpenid;

function resetState() {
  users = [
    { _id: 'user-1', openid: 'allowed-openid', nickname: '成员一', enabled: true },
    { _id: 'user-2', openid: 'other-openid', nickname: '成员二', enabled: true }
  ];
  currentOpenid = 'allowed-openid';
}

function createCollection() {
  return {
    where(filters) {
      const getMatchingDocuments = () => users.filter((document) => (
        Object.entries(filters).every(([key, value]) => document[key] === value)
      ));

      return {
        async get() {
          return { data: getMatchingDocuments() };
        },
        limit() {
          return {
            async get() {
              return { data: getMatchingDocuments().slice(0, 1) };
            }
          };
        }
      };
    },
    async add({ data }) {
      users.push({ _id: `user-${users.length + 1}`, ...data });
      return { _id: `user-${users.length}` };
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

beforeEach(resetState);

test('allows one of the two enabled family users', async () => {
  await expect(main()).resolves.toEqual({
    openid: 'allowed-openid',
    allowed: true,
    user: users[0],
    whitelistValid: true
  });
});

test('denies a caller outside the enabled family users', async () => {
  currentOpenid = 'denied-openid';

  await expect(main()).resolves.toEqual({
    openid: 'denied-openid',
    allowed: false,
    user: null,
    whitelistValid: true
  });
});

test('denies login when more than two enabled users are configured', async () => {
  users.push({ _id: 'user-3', openid: 'third-openid', nickname: '成员三', enabled: true });

  await expect(main()).resolves.toEqual({
    openid: 'allowed-openid',
    allowed: false,
    user: null,
    whitelistValid: false
  });
});

test('auto-provisions the first real mini program caller when no enabled users exist', async () => {
  users = [{ _id: 'placeholder-disabled', openid: 'placeholder-disabled', enabled: false }];

  await expect(main()).resolves.toEqual({
    openid: 'allowed-openid',
    allowed: true,
    user: expect.objectContaining({
      openid: 'allowed-openid',
      nickname: '我',
      role: 'member',
      enabled: true
    }),
    whitelistValid: true
  });
  expect(users).toEqual([
    { _id: 'placeholder-disabled', openid: 'placeholder-disabled', enabled: false },
    expect.objectContaining({ openid: 'allowed-openid', enabled: true })
  ]);
});

test('does not auto-provision calls without a real OpenID', async () => {
  users = [{ _id: 'placeholder-disabled', openid: 'placeholder-disabled', enabled: false }];
  currentOpenid = undefined;

  await expect(main()).resolves.toEqual({
    openid: undefined,
    allowed: false,
    user: null,
    whitelistValid: true
  });
  expect(users).toEqual([{ _id: 'placeholder-disabled', openid: 'placeholder-disabled', enabled: false }]);
});
