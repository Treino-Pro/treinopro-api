module.exports = {
  displayName: 'TreinoPRO API Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/main.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 10000,
};
