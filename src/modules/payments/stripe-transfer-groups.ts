export function buildStripeProposalTransferGroup(proposalId: string): string {
  if (!proposalId?.trim()) {
    throw new Error('proposalId is required to build Stripe transfer_group');
  }

  return `proposal_${proposalId}`;
}
