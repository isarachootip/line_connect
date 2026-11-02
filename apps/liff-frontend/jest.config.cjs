// ตั้งค่า Jest สำหรับรัน Unit Test ในระบบ LIFF Frontend
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
};
