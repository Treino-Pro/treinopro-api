export function buildTrainingStartDate(
  trainingDate: Date | string,
  trainingTime?: string,
): Date {
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

export function isProposalExpired(
  now: Date,
  proposal: { trainingDate: Date | string; trainingTime?: string },
): boolean {
  const start = buildTrainingStartDate(
    proposal.trainingDate,
    proposal.trainingTime,
  );
  const isExpired = start.getTime() < now.getTime();

  // Log detalhado para debug
  if (isExpired) {
    console.log(`🔍 [PROPOSAL_UTILS] Proposta expirada detectada:`, {
      proposalId: (proposal as any).id,
      trainingDate: proposal.trainingDate,
      trainingTime: proposal.trainingTime,
      calculatedStart: start.toISOString(),
      now: now.toISOString(),
      isRecontract: !!(proposal as any).targetPersonalId,
      timeDiff: now.getTime() - start.getTime(),
    });
  }

  return isExpired;
}
