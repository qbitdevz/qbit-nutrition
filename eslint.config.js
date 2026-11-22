// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'] },
  {
    // S10: the two network destinations (the AI provider: createAiClient; Open Food Facts: createBarcodeClient) each
    // wrap the fetch they are given in the redirect-safe wrapper. Only the startup wiring may import the device fetch;
    // nothing may call the global one.
    // (src/platform/__tests__/fetchGuard.test.ts enforces the same rule by scanning the sources.)
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/startup/openServicesCore.ts', 'src/platform/deviceFetch.ts', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'expo/fetch', message: 'Use the AI services (createAiClient); only src/platform/deviceFetch.ts may import expo/fetch.' }],
          patterns: [{ group: ['**/platform/deviceFetch', '@/platform/deviceFetch'], message: 'Only the startup wiring may use the device fetch; it is wrapped by createAiClient.' }],
        },
      ],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'The global fetch ignores redirect: "error" on Android. Use the AI services.' }, { name: 'XMLHttpRequest', message: 'Use the AI services.' }],
      'no-restricted-properties': ['error', { object: 'globalThis', property: 'fetch', message: 'Use the AI services.' }, { object: 'window', property: 'fetch', message: 'Use the AI services.' }],
    },
  },
  {
    // core must stay runnable in plain Node (docs/06-system-architecture.md, section 4).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@/app/*', '@/features/*', '@/data/*', '@/platform/*', '@/ui/*'],
              message: 'src/core must not depend on React, Expo, or other app layers.',
            },
          ],
        },
      ],
    },
  },
]);
