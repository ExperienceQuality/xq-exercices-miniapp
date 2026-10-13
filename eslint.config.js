import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/**', 'dist/**', 'node_modules/**', 'reports/**'] },
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
);
