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

  test('returns overdue pending after end date', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-29', 3)).toBe('overdue_pending');
  });
});
