const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const BUILTIN_CATEGORIES = [
  { id: 'builtin-bank-finance', name: '银行理财' },
  { id: 'builtin-fixed-deposit', name: '定期存款' },
  { id: 'builtin-fund', name: '基金' },
  { id: 'builtin-bond', name: '债券' },
  { id: 'builtin-brokerage', name: '券商理财' },
  { id: 'builtin-money-fund', name: '货币基金' },
  { id: 'builtin-yangmao', name: '羊毛' },
  { id: 'builtin-promo-reward', name: '活动奖励' },
  { id: 'builtin-other', name: '其他' }
];

async function requireBootstrapAllowed(openid) {
  const configuredOpenids = (process.env.BOOTSTRAP_OPENIDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOpenids.includes(openid)) return;

  const users = await db.collection('users')
    .where({ openid, enabled: true })
    .limit(1)
    .get();

  if (users.data.length > 0) return;

  const error = new Error('Bootstrap access denied');
  error.code = 'BOOTSTRAP_FORBIDDEN';
  throw error;
}

exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext();
  await requireBootstrapAllowed(openid);

  const categories = db.collection('categories');

  for (let index = 0; index < BUILTIN_CATEGORIES.length; index += 1) {
    const category = BUILTIN_CATEGORIES[index];
    await categories.doc(category.id).set({
      data: {
        name: category.name,
        type: 'builtin',
        enabled: true,
        sortOrder: index + 1,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  }

  await db.collection('settings').doc('default').set({
    data: {
      dueSoonDays: 3,
      defaultYear: new Date().getFullYear(),
      subscriptionReminderEnabled: false,
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    categoriesInserted: BUILTIN_CATEGORIES.length,
    settingsReady: true
  };
};
