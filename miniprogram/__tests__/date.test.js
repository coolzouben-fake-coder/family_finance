const { daysInclusive, getDateStatus } = require('../utils/date');

describe('date utilities', () => {
  test('counts holding days inclusively', () => {
    expect(daysInclusive('2026-07-01', '2026-07-28')).toBe(28);
  });

  test('prioritizes redeemed and cancelled states before date states', () => {
    expect(getDateStatus({ manualStatus: 'redeemed', startDate: '2026-07-01', endDate: '2026-07-28' }, '2026-07-10', 3)).toBe('redeemed');
    expect(getDateStatus({ manualStatus: 'cancelled', startDate: '2026-07-01', endDate: '2026-07-28' }, '2026-07-10', 3)).toBe('cancelled');
  });

  test('returns due soon before active', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-26', 3)).toBe('due_soon');
  });

  test('defaults due soon window to three days', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-26')).toBe('due_soon');
  });

  test('includes the exact due-soon day boundary', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-25', 3)).toBe('due_soon');
  });

  test('returns overdue pending after end date', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-29', 3)).toBe('overdue_pending');
  });

  test('treats released principal with pending reward as pending confirmation', () => {
    const project = {
      manualStatus: 'active',
      principalStatus: 'released',
      rewardStatus: 'pending',
      startDate: '2026-07-01',
      endDate: '2026-07-28'
    };

    expect(getDateStatus(project, '2026-07-29', 3)).toBe('overdue_pending');
  });

  test('keeps reward-received projects in the principal due-soon queue while principal is holding', () => {
    const project = {
      manualStatus: 'active',
      principalStatus: 'holding',
      rewardStatus: 'received',
      startDate: '2026-07-01',
      endDate: '2026-07-28'
    };

    expect(getDateStatus(project, '2026-07-26', 3)).toBe('due_soon');
  });
});
