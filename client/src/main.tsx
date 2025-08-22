import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("🚀 main.tsx is executing!");
const rootElement = document.getElementById("root");
console.log("🚀 Root element:", rootElement);

if (rootElement) {
  createRoot(rootElement).render(<App />);
  console.log("🚀 React app mounted!");
} else {
  console.error("❌ Root element not found!");
}
