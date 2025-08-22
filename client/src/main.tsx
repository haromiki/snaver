import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Test to see if React is mounting at all
console.log("🚀 main.tsx is executing!");
const rootElement = document.getElementById("root");
console.log("🚀 Root element:", rootElement);

if (rootElement) {
  // First, add a direct DOM test
  rootElement.innerHTML = '<div style="background: red; color: white; padding: 20px; font-size: 24px;">DIRECT DOM TEST - SHOULD BE VISIBLE</div>';
  
  setTimeout(() => {
    // Then mount React after a short delay
    createRoot(rootElement).render(
      <div style={{ background: 'blue', color: 'white', padding: '20px', fontSize: '24px' }}>
        REACT IS WORKING!
        <App />
      </div>
    );
  }, 1000);
} else {
  console.error("🚨 Root element not found!");
}
