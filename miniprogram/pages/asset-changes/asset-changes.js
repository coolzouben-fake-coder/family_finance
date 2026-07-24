const { ensureAllowedSession } = require('../../services/session');
const { listAssetChanges } = require('../../services/cloud');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatAssetChange(change) {
  const beforeAmount = Number(change.beforeAmount || 0);
  const afterAmount = Number(change.afterAmount || 0);
  const inferredAmount = Math.abs(afterAmount - beforeAmount);
  const type = change.type || (afterAmount >= beforeAmount ? 'deposit' : 'withdraw');
  const amount = Number(change.amount || inferredAmount);
  const sign = type === 'withdraw' ? '-' : '+';
  return {
    ...change,
    type,
    typeLabel: type === 'withdraw' ? '支取' : '存入',
    amountText: `${sign}${money(amount)}`,
    beforeText: money(beforeAmount),
    afterText: money(afterAmount),
    createdText: typeof change.createdAt === 'string' ? change.createdAt.slice(0, 10) : ''
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    changes: []
  },

  onLoad() {
    this.loadChanges();
  },

  loadChanges() {
    this.setData({ loading: true, errorMessage: '' });
    return ensureAllowedSession()
      .then(() => listAssetChanges())
      .then((result) => {
        this.setData({
          loading: false,
          changes: (result.changes || []).map(formatAssetChange)
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          changes: [],
          errorMessage: '调整记录加载失败，请稍后重试'
        });
      });
  }
});
