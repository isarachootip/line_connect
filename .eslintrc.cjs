// ตั้งค่า ESLint กลางสำหรับตรวจจับการใช้ any และควบคุมคุณภาพโค้ดทั้ง Monorepo
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    jest: true,
    es2022: true,
  },
  rules: {
    // ห้ามใช้ any โดยเด็ดขาดตามมาตรฐาน Clean Architecture
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.js', '*.cjs'],
};
