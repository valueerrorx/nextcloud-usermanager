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
  {
    // src/shared/ is pure: no I/O, no node:*, no electron, no vue (ARCHITECTURE §2)
    files: ['src/shared/**/*.js', 'src/main/ocs/serverInfoPage.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['node:*', 'electron', 'vue', 'fs', 'path', 'child_process'],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'process', 'require', 'XMLHttpRequest'],
    },
  },
];
