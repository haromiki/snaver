import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 중복 마운팅 방지를 위한 플래그
let isAppMounted = false;

function mountApp() {
  if (isAppMounted) return;
  
  const rootElement = document.getElementById("root");
  if (!rootElement) return;
  
  try {
    // 기존 내용 완전히 클리어
    rootElement.innerHTML = '';
    
    // React 앱 마운트
    const root = createRoot(rootElement);
    root.render(<App />);
    
    isAppMounted = true;
    console.log("✅ SNAVER React 앱 마운트 완료");
    
    // 강제 표시
    rootElement.style.display = 'block';
    rootElement.style.visibility = 'visible';
    rootElement.style.opacity = '1';
    
  } catch (error) {
    console.error("❌ React 앱 마운트 실패:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; text-align: center; background: white; min-height: 100vh;">
        <h1 style="color: #1976d2;">SNAVER - 네이버 쇼핑 순위 추적</h1>
        <p>React 앱 로딩 실패. 페이지를 새로고침해주세요.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">새로고침</button>
      </div>
    `;
  }
}

// DOM이 로딩되면 앱 마운트
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  // DOM이 이미 로딩 완료된 경우
  mountApp();
}
