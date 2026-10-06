import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'release/**'],
  },
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/renderer/**/*.js', '**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['src/preload/index.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'error',
    },
  },
];
