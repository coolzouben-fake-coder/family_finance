const { ensureAllowedSession } = require('../../services/session');
const { listAssetChanges, repayAssetDeposit } = require('../../services/cloud');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatAssetChange(change) {
  const beforeAmount = Number(change.beforeAmount || 0);
  const afterAmount = Number(change.afterAmount || 0);
  const inferredAmount = Math.abs(afterAmount - beforeAmount);
  const type = change.type || (afterAmount >= beforeAmount ? 'deposit' : 'withdraw');
  const amount = Number(change.amount || inferredAmount);
  const isDecrease = type === 'withdraw' || type === 'repay';
  const sign = isDecrease ? '-' : '+';
  const repaidAmount = Number(change.repaidAmount || 0);
  const outstandingAmount = Number(change.outstandingAmount || 0);
  return {
    ...change,
    type,
    typeLabel: type === 'repay' ? '归还' : (type === 'withdraw' ? '支取' : '存入'),
    amountText: `${sign}${money(amount)}`,
    beforeText: money(beforeAmount),
    afterText: money(afterAmount),
    repaidText: money(repaidAmount),
    outstandingText: money(outstandingAmount),
    canRepay: type === 'deposit' && outstandingAmount > 0,
    createdText: typeof change.createdAt === 'string' ? change.createdAt.slice(0, 10) : ''
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    changes: [],
    repaying: false,
    repayDeposit: null,
    repayAmountInput: '',
    repayReasonInput: '',
    repayErrorMessage: '',
    savingRepayment: false
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
  },

  startRepay(event) {
    const depositId = event.currentTarget.dataset.id;
    const repayDeposit = this.data.changes.find((change) => change._id === depositId);
    if (!repayDeposit || !repayDeposit.canRepay) return;

    this.setData({
      repaying: true,
      repayDeposit,
      repayAmountInput: '',
      repayReasonInput: `归还：${repayDeposit.reason || ''}`,
      repayErrorMessage: ''
    });
  },

  cancelRepay() {
    this.setData({
      repaying: false,
      repayDeposit: null,
      repayAmountInput: '',
      repayReasonInput: '',
      repayErrorMessage: '',
      savingRepayment: false
    });
  },

  onRepayAmountInput(event) {
    this.setData({ repayAmountInput: event.detail.value });
  },

  onRepayReasonInput(event) {
    this.setData({ repayReasonInput: event.detail.value });
  },

  submitRepay() {
    if (!this.data.repayDeposit || this.data.savingRepayment) {
      return Promise.resolve();
    }

    const amount = this.data.repayAmountInput;
    const normalizedReason = String(this.data.repayReasonInput || '').trim();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      this.setData({ repayErrorMessage: '请输入有效归还金额' });
      return Promise.resolve();
    }
    if (numericAmount > Number(this.data.repayDeposit.outstandingAmount || 0)) {
      this.setData({ repayErrorMessage: '归还金额不能超过剩余金额' });
      return Promise.resolve();
    }
    if (!normalizedReason) {
      this.setData({ repayErrorMessage: '请输入归还原因' });
      return Promise.resolve();
    }

    this.setData({ savingRepayment: true, repayErrorMessage: '' });
    return repayAssetDeposit(this.data.repayDeposit._id, amount, normalizedReason)
      .then(() => this.loadChanges())
      .then(() => {
        this.setData({
          repaying: false,
          repayDeposit: null,
          repayAmountInput: '',
          repayReasonInput: '',
          savingRepayment: false
        });
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '归还已记录', icon: 'success' });
        }
      })
      .catch(() => {
        this.setData({
          savingRepayment: false,
          repayErrorMessage: '归还失败，请稍后重试'
        });
      });
  }
});
