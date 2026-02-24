export const FeatureFlags = {
  // DEPRECATED: Código 4 dígitos agora é obrigatório por regra de domínio.
  // Mantido para referência; não mais usado em startClass/confirmClassStart.
  get CODE_4_DIGITS() {
    return process.env.FEATURE_CODE_4_DIGITS === 'true';
  },
  // DEPRECATED: Regra de 45 minutos agora é obrigatória por regra de domínio.
  // Mantido para referência; não mais usado em completeClass.
  get MIN_45_RULE() {
    return process.env.FEATURE_45_MIN_RULE === 'true';
  },
  get DISPUTE_DEFENSE() {
    return process.env.FEATURE_DISPUTE_DEFENSE === 'true';
  },
};
