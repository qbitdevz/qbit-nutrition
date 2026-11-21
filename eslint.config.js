// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'] },
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
