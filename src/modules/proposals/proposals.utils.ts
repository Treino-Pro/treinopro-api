function extractTrainingDateParts(
  trainingDate: Date | string,
): { year: number; monthIndex: number; day: number } {
  if (typeof trainingDate === 'string') {
    const match = trainingDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: Number(match[1]),
        monthIndex: Number(match[2]) - 1,
        day: Number(match[3]),
      };
    }
  }

  const parsed = new Date(trainingDate);
  return {
    year: parsed.getUTCFullYear(),
    monthIndex: parsed.getUTCMonth(),
    day: parsed.getUTCDate(),
  };
}

export function buildTrainingStartDate(
  trainingDate: Date | string,
  trainingTime?: string,
): Date {
  try {
    const { year, monthIndex, day } = extractTrainingDateParts(trainingDate);
    const [hhStr, mmStr] = String(trainingTime ?? '00:00').split(':');
    const hh = Number(hhStr ?? 0);
    const mm = Number(mmStr ?? 0);
    return new Date(year, monthIndex, day, hh, mm, 0, 0);
  } catch (_) {
    return new Date(trainingDate); // fallback: apenas a data
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
