export const FeatureFlags = {
  get CODE_4_DIGITS() {
    return process.env.FEATURE_CODE_4_DIGITS === 'true';
  },
  get MIN_45_RULE() {
    return process.env.FEATURE_45_MIN_RULE === 'true';
  },
  get DISPUTE_DEFENSE() {
    return process.env.FEATURE_DISPUTE_DEFENSE === 'true';
  },
};
