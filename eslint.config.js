import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'reports/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    files: ['tests/browser/**/*.spec.{js,ts}'],
    ...playwright.configs['flat/recommended'],
  },
);
