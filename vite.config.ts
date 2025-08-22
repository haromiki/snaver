import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// 🛡️ 리플릿 환경에서만 활성화되는 플러그인 (REPL_ID로 감지)
const replPlugins =
  process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
    ? []
    : [];

// 👇️ DO NOT MODIFY BELOW: 리플릿 + 서버에서 공통 사용하는 alias 및 기본 경로
export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...replPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
// 👆️ DO NOT MODIFY ABOVE
