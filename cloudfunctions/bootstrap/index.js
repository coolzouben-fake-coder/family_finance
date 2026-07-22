const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const BUILTIN_CATEGORIES = [
  '银行理财',
  '定期存款',
  '基金',
  '债券',
  '券商理财',
  '货币基金',
  '羊毛',
  '活动奖励',
  '其他'
];

exports.main = async () => {
  const categories = db.collection('categories');
  let inserted = 0;

  for (let index = 0; index < BUILTIN_CATEGORIES.length; index += 1) {
    const name = BUILTIN_CATEGORIES[index];
    const existing = await categories.where({ name, type: 'builtin' }).limit(1).get();
    if (existing.data.length === 0) {
      await categories.add({
        data: {
          name,
          type: 'builtin',
          enabled: true,
          sortOrder: index + 1,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      inserted += 1;
    }
  }

  const settings = db.collection('settings');
  const currentSettings = await settings.limit(1).get();
  if (currentSettings.data.length === 0) {
    await settings.add({
      data: {
        dueSoonDays: 3,
        defaultYear: new Date().getFullYear(),
        subscriptionReminderEnabled: false,
        updatedAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    categoriesInserted: inserted,
    settingsReady: true
  };
};
