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
  const activeProjects = projects.filter((project) => project.manualStatus !== 'cancelled');
  const principalHoldingProjects = activeProjects.filter((project) => (
    (project.principalStatus || (project.manualStatus === 'redeemed' ? 'released' : 'holding')) === 'holding'
  ));
  const principalReleasedProjects = activeProjects.filter((project) => (
    (project.principalStatus || (project.manualStatus === 'redeemed' ? 'released' : 'holding')) === 'released'
  ));
  const rewardReceivedProjects = activeProjects.filter((project) => (
    (project.rewardStatus || (project.manualStatus === 'redeemed' || project.returnStatus === 'received' ? 'received' : 'pending')) === 'received'
  ));
  const rewardPendingProjects = activeProjects.filter((project) => (
    (project.rewardStatus || (project.manualStatus === 'redeemed' || project.returnStatus === 'received' ? 'received' : 'pending')) === 'pending'
  ));
  const investedAmount = roundMoney(principalHoldingProjects
    .reduce((sum, project) => sum + Number(project.principal || 0), 0));
  const inTransitInterest = principalHoldingProjects
    .reduce((sum, project) => sum + Number(project.expectedInterest || 0), 0);
  const inTransitReward = rewardPendingProjects
    .reduce((sum, project) => sum + Number(project.fixedReward || 0), 0);
  const realizedInterest = principalReleasedProjects
    .reduce((sum, project) => sum + Number(project.actualInterest || 0), 0);
  const realizedReward = rewardReceivedProjects
    .reduce((sum, project) => sum + Number(project.actualFixedReward || 0), 0);
  const inTransitReturn = roundMoney(inTransitInterest + inTransitReward);
  const realizedReturn = roundMoney(realizedInterest + realizedReward);

  const idleAmount = roundMoney((Number(totalAssets) || 0) - investedAmount);
  const utilizationRate = totalAssets > 0 ? investedAmount / totalAssets : 0;

  return {
    totalAssets: roundMoney(totalAssets),
    investedAmount,
    idleAmount,
    utilizationRate,
    inTransitReturn,
    realizedReturn
  };
}

module.exports = {
  calcExpectedInterest,
  calcActualAnnualRate,
  calcActualTotalReturn,
  summarizeCapital
};
