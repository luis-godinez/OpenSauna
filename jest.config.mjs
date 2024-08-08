// jest.config.mjs

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json', // Points to your tsconfig.json
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/src/__tests__/**/*.test.ts'], // Ensure this matches your test file location
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/src/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'], // Ignore dist directory
};