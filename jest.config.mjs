// jest.config.mjs

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/src/__tests__/**/*.test.ts'], // Ensure this matches your test file location
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/src/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'], // Ignore dist directory
  // existing config options
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Strip .js extension for TypeScript files
  },
};