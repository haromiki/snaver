import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ProductTable from "@/components/ProductTable";
import AddProductModal from "@/components/AddProductModal";
import { apiRequest } from "@/lib/api";

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState("organic-tracking");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchStatus, setSearchStatus] = useState<any>(null);

  // 자동 검색 상태 조회 (5초마다)
  useEffect(() => {
    const fetchSearchStatus = async () => {
      try {
        const response = await apiRequest("GET", "/search-status");
        const status = await response.json();
        setSearchStatus(status);
      } catch (error) {
        console.error("검색 상태 조회 실패:", error);
      }
    };

    fetchSearchStatus(); // 초기 조회
    const interval = setInterval(fetchSearchStatus, 5000); // 5초마다 조회

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900" style={{ width: '1920px', maxWidth: '1920px' }}>
      <Sidebar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-gray-50 dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
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

        {/* 자동 검색 상태 표시 */}
        {searchStatus && (searchStatus.isProcessing || searchStatus.activeSearches?.length > 0) && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {searchStatus.isProcessing && (
                    <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  )}
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {searchStatus.isProcessing ? '자동 검색 진행중' : '자동 검색 완료'}
                  </span>
                </div>
                
                {searchStatus.queueLength > 0 && (
                  <div className="flex items-center space-x-1 text-sm text-blue-700 dark:text-blue-300">
                    <i className="fas fa-clock"></i>
                    <span>대기 중: {searchStatus.queueLength}개</span>
                  </div>
                )}
                
                <div className="flex items-center space-x-4 text-sm text-blue-700 dark:text-blue-300">
                  {searchStatus.activeSearches?.map((search: any) => (
                    <div key={search.productId} className="flex items-center space-x-1">
                      {search.status === 'searching' && <i className="fas fa-search animate-pulse"></i>}
                      {search.status === 'retrying' && <i className="fas fa-redo animate-spin"></i>}
                      {search.status === 'completed' && <i className="fas fa-check-circle"></i>}
                      {search.status === 'failed' && <i className="fas fa-exclamation-circle text-red-500"></i>}
                      <span className="truncate max-w-32">{search.keyword}</span>
                      {search.status === 'completed' && search.result && (
                        <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-1 rounded">
                          {search.result}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="text-xs text-blue-600 dark:text-blue-400">
                마지막 업데이트: {new Date(searchStatus.lastUpdate).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto" style={{ padding: '24px' }}>
          <ProductTable 
            section={activeSection}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onAddProduct={() => setShowAddModal(true)}
            onEditProduct={(product) => setEditingProduct(product)}
          />
        </main>
      </div>

      {/* 제품 추가/수정 모달 */}
      {(showAddModal || editingProduct) && (
        <AddProductModal 
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          product={editingProduct}
        />
      )}
    </div>
  );
}