import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ตั้งค่า Vite สำหรับสร้างและรันแอปพลิเคชัน Admin Backoffice (React + TypeScript)
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@line-connect/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/packages[\\/]shared/, /node_modules/],
    },
  },
  server: {
    port: 5174,
  },
});
