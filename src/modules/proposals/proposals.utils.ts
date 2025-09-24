export function buildTrainingStartDate(trainingDate: Date | string, trainingTime?: string): Date {
  const base = new Date(trainingDate);
  try {
    const [hhStr, mmStr] = String(trainingTime ?? '00:00').split(':');
    const hh = Number(hhStr ?? 0);
    const mm = Number(mmStr ?? 0);
    base.setHours(hh, mm, 0, 0);
    return base;
  } catch (_) {
    return base; // fallback: apenas a data
  }
}

export function isProposalExpired(now: Date, proposal: { trainingDate: Date | string; trainingTime?: string }): boolean {
  const start = buildTrainingStartDate(proposal.trainingDate, proposal.trainingTime);
  return start.getTime() < now.getTime();
}


