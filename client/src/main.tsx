import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 기본 테스트 먼저
const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = '<div style="padding: 20px; background: lightblue; color: black; font-size: 18px;">✅ MAIN.TSX 실행됨 - React 로딩 중...</div>';
}

setTimeout(() => {
  if (rootElement) {
    createRoot(rootElement).render(<App />);
  }
}, 1000);
