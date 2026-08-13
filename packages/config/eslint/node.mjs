import base from './base.mjs';

/**
 * ESLint config for Node.js targets (API, workers, tooling).
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
];
