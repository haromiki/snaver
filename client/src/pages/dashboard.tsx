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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 p-4">
      {/* 모바일 오버레이 */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* 사이드바 - 데스크톱: 항상 표시, 모바일: 슬라이딩 */}
      <div className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
        transition-transform duration-300 ease-in-out
        lg:block
      `}>
        <Sidebar 
          activeSection={activeSection} 
          onSectionChange={(section) => {
            setActiveSection(section);
            setIsMobileMenuOpen(false); // 모바일에서 메뉴 선택 시 닫기
          }}
        />
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden ml-0 lg:ml-4">
        {/* Top Bar */}
        <header className="bg-gray-50 dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-3 lg:px-6 py-3 lg:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 lg:space-x-6">
              {/* 모바일 햄버거 메뉴 */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                data-testid="button-mobile-menu"
              >
                <i className="fas fa-bars text-lg"></i>
              </button>
              
              <div>
                <h2 className="text-lg lg:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {activeSection === "ad-tracking" && "광고 순위 추적"}
                  {activeSection === "organic-tracking" && "일반 순위 추적"}
                  {activeSection === "ad-management" && "광고 제품 관리"}
                  {activeSection === "organic-management" && "일반 제품 관리"}
                </h2>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                  {activeSection.includes("tracking") 
                    ? "실시간으로 네이버 쇼핑 순위를 추적합니다"
                    : "제품을 관리하고 설정을 변경할 수 있습니다"
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 lg:space-x-4">
              <div className="flex items-center space-x-2 lg:space-x-3">
                <div className="relative">
                  <select 
                    className="appearance-none bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md px-2 lg:px-4 py-2 pr-6 lg:pr-8 text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    data-testid="filter-status"
                  >
                    <option value="all">전체</option>
                    <option value="active">활성</option>
                    <option value="inactive">비활성</option>
                  </select>
                  <i className="fas fa-chevron-down absolute right-2 lg:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
                
                <div className="relative hidden md:block">
                  <input 
                    type="text" 
                    placeholder="제품명 또는 키워드 검색" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 lg:pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent w-48 lg:w-64 bg-white dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                    data-testid="input-search"
                  />
                  <i className="fas fa-search absolute left-2 lg:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs lg:text-sm"></i>
                </div>
                
                <button 
                  className="px-3 lg:px-4 py-2 bg-primary text-white rounded-md text-xs lg:text-sm font-medium hover:bg-blue-700 transition-colors"
                  onClick={() => setShowAddModal(true)}
                  data-testid="button-add-product"
                >
                  <i className="fas fa-plus mr-1 lg:mr-2"></i>
                  <span className="hidden sm:inline">제품 추가</span>
                  <span className="sm:hidden">추가</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-3 lg:p-6">
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