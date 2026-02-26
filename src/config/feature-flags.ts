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

  // ===== KILL SWITCHES (padrão = ativo; setar env var para 'true' DESATIVA) =====
  // Usar em emergência para reverter sem deploy.

  /** Setar KILL_CODE_4_DIGITS=true para desativar código obrigatório e voltar ao behavior antigo (flag-based). */
  get KILL_CODE_4_DIGITS() {
    return process.env.KILL_CODE_4_DIGITS === 'true';
  },
  /** Setar KILL_MIN_45_RULE=true para desativar regra 45min obrigatória e voltar ao behavior antigo (flag-based). */
  get KILL_MIN_45_RULE() {
    return process.env.KILL_MIN_45_RULE === 'true';
  },
};
