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

  // ===== REGRAS DE NEGÓCIO CONFIGURÁVEIS =====

  /** Duração mínima de uma aula em minutos. Padrão: 50. Ex: CLASS_MIN_COMPLETION_MINUTES=30 */
  get CLASS_MIN_COMPLETION_MINUTES(): number {
    const v = parseInt(process.env.CLASS_MIN_COMPLETION_MINUTES ?? '', 10);
    return isNaN(v) || v <= 0 ? 50 : v;
  },

  /** Antecedência mínima para cancelamento pelo aluno, em horas. Padrão: 2. Ex: CLASS_CANCELLATION_WINDOW_HOURS=1 */
  get CLASS_CANCELLATION_WINDOW_HOURS(): number {
    const v = parseFloat(process.env.CLASS_CANCELLATION_WINDOW_HOURS ?? '');
    return isNaN(v) || v < 0 ? 2 : v;
  },

  /** Antecedência máxima para o botão "Iniciar" ficar disponível, em minutos. Padrão: 30. */
  get CLASS_START_WINDOW_BEFORE_MINUTES(): number {
    const v = parseInt(process.env.CLASS_START_WINDOW_BEFORE_MINUTES ?? '', 10);
    return isNaN(v) || v < 0 ? 30 : v;
  },

  /** Atraso máximo após o horário para o botão "Iniciar" ainda ficar disponível, em minutos. Padrão: 10. */
  get CLASS_START_WINDOW_AFTER_MINUTES(): number {
    const v = parseInt(process.env.CLASS_START_WINDOW_AFTER_MINUTES ?? '', 10);
    return isNaN(v) || v < 0 ? 10 : v;
  },
};
