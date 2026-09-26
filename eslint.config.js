// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['scripts/**/*.{js,cjs}', 'server/**/*.{js,cjs}', 'demo/**/*.{js,cjs}', 'tests/**/*.{js,cjs}', 'metro.config.js', 'lib/**/*.{js,cjs}'],
    languageOptions: { globals: { Buffer: 'readonly', __dirname: 'readonly' } },
  },
]);
