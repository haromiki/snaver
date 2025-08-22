import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ProductTable from "@/components/ProductTable";
import AddProductModal from "@/components/AddProductModal";

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState("ad-tracking");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // 🎯 DO NOT DELETE BELOW: Debug logging for dashboard state
  console.log("🎯 [디버그] Dashboard component rendering");
  console.log("🎯 [디버그] Dashboard state:", {
    activeSection,
    showAddModal,
    editingProduct
  });
  // 🎯 DO NOT DELETE ABOVE

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, background: 'red', color: 'white', padding: '10px' }}>
        TEST: Dashboard is rendering!
      </div>
      <div className="flex h-screen bg-gray-100" style={{ minHeight: '100vh', width: '100%' }}>
        <div style={{ background: 'blue', color: 'white', padding: '20px', width: '200px' }}>
          TEST SIDEBAR
        </div>
        <div style={{ background: 'green', color: 'white', padding: '20px', flex: 1 }}>
          TEST MAIN CONTENT
        </div>
      </div>
    </>
  );
}