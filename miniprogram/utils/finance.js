function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function calcExpectedInterest(principal, annualRate, holdingDays) {
  return roundMoney(principal * annualRate * holdingDays / 365);
}

function calcActualTotalReturn(actualInterest, actualFixedReward) {
  return roundMoney((Number(actualInterest) || 0) + (Number(actualFixedReward) || 0));
}

function calcActualAnnualRate(actualTotalReturn, principal, holdingDays) {
  if (!principal || !holdingDays) return 0;
  return actualTotalReturn / principal / holdingDays * 365;
}

function summarizeCapital(totalAssets, projects) {
  const investedAmount = roundMoney(projects
    .filter((project) => project.manualStatus === 'active')
    .reduce((sum, project) => sum + Number(project.principal || 0), 0));

  const idleAmount = roundMoney((Number(totalAssets) || 0) - investedAmount);
  const utilizationRate = totalAssets > 0 ? investedAmount / totalAssets : 0;

  return {
    totalAssets: roundMoney(totalAssets),
    investedAmount,
    idleAmount,
    utilizationRate
  };
}

module.exports = {
  calcExpectedInterest,
  calcActualAnnualRate,
  calcActualTotalReturn,
  summarizeCapital
};
