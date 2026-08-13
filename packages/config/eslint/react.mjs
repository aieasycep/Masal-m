import base from './base.mjs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint config for React targets (mobile, admin).
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...base,
  {
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-key': 'error',
      'react/jsx-no-useless-fragment': 'warn',
      'react/self-closing-comp': 'warn',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
];
