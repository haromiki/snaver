import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/snaver/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../dist/public',
    assetsDir: 'assets',
    emptyOutDir: false, // outDir이 루트 밖이라 비우지 않음(경고 억제 목적)
  },
});
