import react from '@masalim/config/eslint/react';

export default [
  ...react,
  {
    ignores: ['.expo/**', 'dist-export/**', 'android/**', 'ios/**'],
  },
];
