import node from '@masalim/config/eslint/node';

export default [
  ...node,
  {
    rules: {
      // Off on purpose: Nest DI + ZodValidationPipe resolve constructor and
      // handler param classes through emitDecoratorMetadata, which erases
      // type-only imports at runtime — auto-fixing to `import type` silently
      // breaks injection and request validation.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
