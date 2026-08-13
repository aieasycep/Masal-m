import react from '@masalim/config/eslint/react';

export default [
  ...react,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
