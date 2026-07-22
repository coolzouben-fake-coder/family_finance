function parseDate(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

function daysUntil(endDate, today) {
  const end = parseDate(endDate);
  const current = parseDate(today);
  return Math.floor((end.getTime() - current.getTime()) / 86400000);
}

function getDateStatus(project, today, dueSoonDays = 3) {
  if (project.manualStatus === 'cancelled') return 'cancelled';
  if (project.manualStatus === 'redeemed') return 'redeemed';

  if (today < project.startDate) return 'not_started';
  if (today > project.endDate) return 'overdue_pending';

  const remainingDays = daysUntil(project.endDate, today);
  if (remainingDays >= 0 && remainingDays <= dueSoonDays) return 'due_soon';

  return 'active';
}

module.exports = {
  daysInclusive,
  getDateStatus
};
