// Variáveis de ambiente para testes — deve ser carregado via setupFiles (antes dos imports)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRATION_TIME = '1h';
process.env.DATABASE_URL = 'mock://test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.PORT = '3000';
process.env.FEATURE_CODE_4_DIGITS = 'true';
process.env.FEATURE_45_MIN_RULE = 'true';
process.env.FEATURE_DISPUTE_DEFENSE = 'true';
