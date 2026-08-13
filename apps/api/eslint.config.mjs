import node from '@masalim/config/eslint/node';

export default [
  ...node,
  {
    rules: {
      // NestJS DI relies on classes referenced as types in constructors.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
];
