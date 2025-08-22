import { createRoot } from "react-dom/client";
import "./index.css";

console.log("🚀 main.tsx가 실행되었습니다!");

// 간단한 테스트 화면
function TestApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: 'green' }}>✅ SNAVER 테스트 성공!</h1>
      <p>React가 정상적으로 작동하고 있습니다.</p>
      <button 
        onClick={() => alert('버튼 클릭 성공!')}
        style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}
      >
        테스트 버튼
      </button>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("✅ root 요소를 찾았습니다!");
  createRoot(rootElement).render(<TestApp />);
  console.log("✅ React 렌더링이 완료되었습니다!");
} else {
  console.error("❌ root 요소를 찾을 수 없습니다!");
}
