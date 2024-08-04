// jest.config.mjs

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'es2022',
          module: 'es2022',
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/src/__tests__/**/*.test.ts'], // Ensure this matches your test file location
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
};
