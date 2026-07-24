const assert = require('assert');

const documents = {
  categories: {
    'legacy-fund': {
      _id: 'legacy-fund',
      name: '基金',
      type: 'builtin',
      enabled: false,
      sortOrder: 99,
      createdAt: 'original-created-at'
    }
  },
  settings: {
    'legacy-settings': {
      _id: 'legacy-settings',
      dueSoonDays: 14,
      preserved: true
    }
  }
};
const writes = [];

function createCollection(name) {
  const collection = documents[name];

  return {
    where(query) {
      const matches = Object.values(collection).filter((document) => (
        Object.entries(query).every(([key, value]) => document[key] === value)
      ));
      return {
        limit() {
          return {
            async get() {
              return { data: matches.slice(0, 1) };
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
          return { data: collection[id] ? [collection[id]] : [] };
        },
        async set({ data }) {
          collection[id] = { _id: id, ...data };
          writes.push({ operation: 'set', collection: name, id });
        },
        async update({ data }) {
          Object.assign(collection[id], data);
          writes.push({ operation: 'update', collection: name, id });
        }
      };
    }
  };
}

const mockCloud = {
  DYNAMIC_CURRENT_ENV: 'current',
  init() {},
  getWXContext() {
    return { OPENID: 'openid-a' };
  },
  database() {
    return {
      collection: createCollection,
      serverDate() {
        return 'server-date';
      },
      async runTransaction(callback) {
        return callback({ collection: createCollection });
      }
    };
  }
};

jest.mock('wx-server-sdk', () => mockCloud, { virtual: true });

process.env.BOOTSTRAP_OPENIDS = 'openid-a,openid-b';
const { main } = require('./index');

test('preserves logical identity for built-in categories', async () => {
  const result = await main();
  assert.deepStrictEqual(result, {
    ok: true,
    categoriesInserted: 8,
    settingsReady: true
  });
  assert.strictEqual(documents.categories['legacy-fund'].createdAt, 'original-created-at');
  assert.strictEqual(documents.categories['legacy-fund'].enabled, true);
  assert.strictEqual(documents.categories['builtin-yangmao'].sortOrder, 1);
  assert.strictEqual(documents.categories['builtin-bank-finance'].sortOrder, 2);
  assert.strictEqual(documents.categories['legacy-fund'].sortOrder, 4);
  assert.strictEqual(documents.settings['legacy-settings'].preserved, true);
  assert.strictEqual(documents.settings.default, undefined);
  assert.strictEqual(writes.filter((write) => write.operation === 'set').length, 8);
  assert.strictEqual(writes.some((write) => write.id === 'builtin-fund'), false);
});
