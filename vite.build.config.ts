import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/snaver/',
  plugins: [react()],
  root: './client', // ✅ index.html 이 존재하는 경로로 수정
  build: {
    outDir: '../dist/public', // ✅ 루트 기준으로 조정됨
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
    },
  },
});
