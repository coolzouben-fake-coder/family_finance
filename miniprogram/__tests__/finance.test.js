const {
  calcExpectedInterest,
  calcActualAnnualRate,
  calcActualTotalReturn,
  summarizeCapital
} = require('../utils/finance');

describe('finance utilities', () => {
  test('calculates expected interest from annual rate', () => {
    expect(calcExpectedInterest(10000, 0.03, 28)).toBeCloseTo(23.01, 2);
  });

  test('calculates actual total return with fixed reward', () => {
    expect(calcActualTotalReturn(23.01, 200)).toBeCloseTo(223.01, 2);
  });

  test('calculates actual annualized return', () => {
    expect(calcActualAnnualRate(223.01, 10000, 28)).toBeCloseTo(0.2907, 4);
  });

  test('summarizes current capital usage from active projects only', () => {
    const result = summarizeCapital(50000, [
      { principal: 10000, manualStatus: 'active' },
      { principal: 8000, manualStatus: 'redeemed' },
      { principal: 6000, manualStatus: 'cancelled' }
    ]);

    expect(result.investedAmount).toBe(10000);
    expect(result.idleAmount).toBe(40000);
    expect(result.utilizationRate).toBe(0.2);
  });
});
