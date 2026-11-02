// ตั้งค่า Jest สำหรับรัน Unit Test ในแพ็กเกจ @line-connect/shared
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
};
