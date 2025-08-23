import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ProductTable from "@/components/ProductTable";
import AddProductModal from "@/components/AddProductModal";

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState("organic-tracking");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900" style={{minHeight: '100vh', width: '100%', display: 'flex', backgroundColor: 'red', color: 'white', padding: '20px'}}>
      <div style={{position: 'absolute', top: '10px', left: '10px', zIndex: 9999, backgroundColor: 'red', color: 'white', padding: '10px'}}>
        🔴 DASHBOARD RENDERING TEST
      </div>
      <Sidebar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden" style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
        {/* Top Bar */}
        <header className="bg-gray-50 dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4" style={{padding: '16px 24px'}}>
          <div className="flex items-center justify-between" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
            <div className="flex items-center space-x-6" style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100" style={{fontSize: '24px', fontWeight: 'bold', margin: 0}}>
                  {activeSection === "ad-tracking" && "광고 순위 추적"}
                  {activeSection === "organic-tracking" && "일반 순위 추적"}
                  {activeSection === "ad-management" && "광고 제품 관리"}
                  {activeSection === "organic-management" && "일반 제품 관리"}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeSection.includes("tracking") 
                    ? "실시간으로 네이버 쇼핑 순위를 추적합니다"
                    : "제품을 관리하고 설정을 변경할 수 있습니다"
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <select 
                    className="appearance-none bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    data-testid="filter-status"
                  >
                    <option value="all">전체 상태</option>
                    <option value="active">활성</option>
                    <option value="inactive">비활성</option>
                  </select>
                  <i className="fas fa-chevron-down absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
                
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="제품명 또는 키워드 검색" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent w-64 bg-white dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    data-testid="input-search"
                  />
                  <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm"></i>
                </div>
                
                <button 
                  className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                  onClick={() => setShowAddModal(true)}
                  data-testid="button-add-product"
                >
                  <i className="fas fa-plus mr-2"></i>제품 추가
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6 bg-white dark:bg-gray-900">
          <ProductTable 
            section={activeSection}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onAddProduct={() => setShowAddModal(true)}
            onEditProduct={(product) => {
              setEditingProduct(product);
              setShowAddModal(true);
            }}
          />
        </main>
      </div>

      {showAddModal && (
        <AddProductModal
          product={editingProduct}
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}
