import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm', // If you're using TypeScript with ESM
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2022',
          module: 'ES2022',
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/?(*.)+(spec|test).ts'], // Matches files like *.spec.ts or *.test.ts
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  verbose: true,
};

export default config;
