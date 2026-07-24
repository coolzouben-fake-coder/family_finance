const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const BUILTIN_CATEGORIES = [
  { id: 'builtin-yangmao', name: '羊毛' },
  { id: 'builtin-bank-finance', name: '银行理财' },
  { id: 'builtin-fixed-deposit', name: '定期存款' },
  { id: 'builtin-fund', name: '基金' },
  { id: 'builtin-bond', name: '债券' },
  { id: 'builtin-brokerage', name: '券商理财' },
  { id: 'builtin-money-fund', name: '货币基金' },
  { id: 'builtin-promo-reward', name: '活动奖励' },
  { id: 'builtin-other', name: '其他' }
];

async function requireBootstrapAllowed(openid) {
  const configuredOpenids = (process.env.BOOTSTRAP_OPENIDS || '')
    .split(',')
    .map((value) => value.trim());

  if (
    configuredOpenids.length !== 2
    || configuredOpenids.some((value) => !value)
    || new Set(configuredOpenids).size !== 2
  ) {
    const error = new Error('BOOTSTRAP_OPENIDS must contain exactly two OpenIDs');
    error.code = 'BOOTSTRAP_OPENIDS_REQUIRED';
    throw error;
  }

  if (configuredOpenids.includes(openid)) return;

  const error = new Error('Bootstrap access denied');
  error.code = 'BOOTSTRAP_FORBIDDEN';
  throw error;
}

exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext();
  await requireBootstrapAllowed(openid);

  const categoriesInserted = await db.runTransaction(async (transaction) => {
    const categories = transaction.collection('categories');
    let categoriesInserted = 0;

    for (let index = 0; index < BUILTIN_CATEGORIES.length; index += 1) {
      const category = BUILTIN_CATEGORIES[index];
      const existing = await categories.where({
        name: category.name,
        type: 'builtin'
      }).limit(1).get();
      const mutableFields = {
        name: category.name,
        type: 'builtin',
        enabled: true,
        sortOrder: index + 1,
        updatedAt: db.serverDate()
      };

      if (existing.data.length > 0) {
        await categories.doc(existing.data[0]._id).update({ data: mutableFields });
      } else {
        await categories.doc(category.id).set({
          data: {
            ...mutableFields,
            createdAt: db.serverDate()
          }
        });
        categoriesInserted += 1;
      }
    }

    const settings = transaction.collection('settings');
    const existingSettings = await settings.limit(1).get();
    if (existingSettings.data.length === 0) {
      await settings.doc('default').set({
        data: {
          dueSoonDays: 3,
          defaultYear: new Date().getFullYear(),
          subscriptionReminderEnabled: false,
          updatedAt: db.serverDate()
        }
      });
    }

    return categoriesInserted;
  });

  return {
    ok: true,
    categoriesInserted,
    settingsReady: true
  };
};
