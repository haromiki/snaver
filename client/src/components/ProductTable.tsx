import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import StatisticsModal from "./StatisticsModal";
import { useToast } from "@/hooks/use-toast";

interface ProductTableProps {
  section: string;
  onAddProduct: () => void;
  onEditProduct?: (product: any) => void;
}

export default function ProductTable({ section, onAddProduct, onEditProduct }: ProductTableProps) {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [sortableList, setSortableList] = useState<any>(null);
  const [refreshingProducts, setRefreshingProducts] = useState<Map<number, number>>(new Map()); // productId -> progress percentage
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Determine filters based on section
  const getFilters = () => {
    const isTracking = section.includes("tracking");
    const type = section.includes("ad") ? "ad" : "organic";
    return { type, active: isTracking };
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["/products", getFilters()],
    queryFn: async () => {
      const filters = getFilters();
      const params = new URLSearchParams();
      if (filters.type) params.append("type", filters.type);
      if (filters.active !== undefined) params.append("active", filters.active.toString());
      
      const response = await apiRequest("GET", `/products?${params}`);
      return await response.json();
    },
  });

  const refreshProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      // Start progress simulation
      startProgressSimulation(productId);
      
      const response = await apiRequest("POST", `/products/${productId}/refresh`);
      return await response.json();
    },
    onSuccess: (data, productId) => {
      // 실서버 환경 최적화 - 강제로 100% 설정 후 즉시 UI 업데이트
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        newMap.set(productId, 100);
        return newMap;
      });
      
      // 캐시 무효화를 먼저 수행
      const currentFilters = getFilters();
      queryClient.invalidateQueries({ queryKey: ["/products", currentFilters] });
      queryClient.refetchQueries({ queryKey: ["/products", currentFilters] });
      
      // 토스트 메시지
      toast({
        title: "수동 검색 완료",
        description: "제품 순위가 업데이트되었습니다.",
      });
      
      // 실서버 안정성을 위해 진행률 제거 시간 증가
      setTimeout(() => {
        setRefreshingProducts(prev => {
          const newMap = new Map(prev);
          newMap.delete(productId);
          return newMap;
        });
      }, 2500); // 2.5초로 증가
    },
    onError: (error: any, productId) => {
      // Remove progress on error
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        newMap.delete(productId);
        return newMap;
      });
      
      toast({
        title: "수동 검색 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ productId, active }: { productId: number; active: boolean }) => {
      const response = await apiRequest("PATCH", `/products/${productId}`, { active });
      return await response.json();
    },
    onSuccess: () => {
      // 현재 필터에 해당하는 쿼리만 정확히 무효화
      const currentFilters = getFilters();
      queryClient.invalidateQueries({ queryKey: ["/products", currentFilters] });
      queryClient.refetchQueries({ queryKey: ["/products", currentFilters] });
      toast({
        title: "상태 변경 완료",
        description: "제품 상태가 업데이트되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "상태 변경 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSortMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      const response = await apiRequest("POST", "/products/sort", { productIds });
      return await response.json();
    },
    onSuccess: () => {
      // 현재 필터에 해당하는 쿼리만 정확히 무효화
      const currentFilters = getFilters();
      queryClient.invalidateQueries({ queryKey: ["/products", currentFilters] });
      queryClient.refetchQueries({ queryKey: ["/products", currentFilters] });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      const response = await apiRequest("DELETE", `/products/${productId}`);
      return await response.json();
    },
    onSuccess: () => {
      // 현재 필터에 해당하는 쿼리만 정확히 무효화
      const currentFilters = getFilters();
      queryClient.invalidateQueries({ queryKey: ["/products", currentFilters] });
      queryClient.refetchQueries({ queryKey: ["/products", currentFilters] });
      toast({
        title: "삭제 완료",
        description: "제품이 성공적으로 삭제되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Progress simulation function - 실서버 환경 최적화
  const startProgressSimulation = (productId: number) => {
    let progress = 0;
    let timeoutId: NodeJS.Timeout;
    
    const updateProgress = () => {
      progress += Math.random() * 10 + 5; // 5-15% 증가
      if (progress > 85) progress = 85; // 85%에서 멈춤 (실서버 안정성)
      
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        newMap.set(productId, Math.floor(progress));
        return newMap;
      });
      
      if (progress < 85) {
        timeoutId = setTimeout(updateProgress, Math.random() * 800 + 500); // 500-1300ms
      }
    };
    
    // 즉시 시작
    updateProgress();
    
    // 최대 20초 후 자동으로 85%로 설정 (실서버 안전장치)
    setTimeout(() => {
      if (timeoutId) clearTimeout(timeoutId);
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        if (newMap.has(productId) && newMap.get(productId)! < 85) {
          newMap.set(productId, 85);
        }
        return newMap;
      });
    }, 20000);
  };

  // Initialize Sortable when products change
  useEffect(() => {
    const loadSortable = async () => {
      // Cleanup existing sortable first
      if (sortableList) {
        try {
          sortableList.destroy();
        } catch (error) {
          console.warn("Sortable cleanup failed:", error);
        }
        setSortableList(null);
      }

      if (products.length > 0) {
        try {
          // Dynamically import Sortable
          const Sortable = (await import("sortablejs")).default;
          
          const element = document.getElementById("sortable-products");
          if (element) {
            const sortableInstance = Sortable.create(element, {
              handle: ".drag-handle",
              animation: 150,
              onEnd: (evt: any) => {
                if (evt.oldIndex !== evt.newIndex) {
                  const newOrder = [...products];
                  const [removed] = newOrder.splice(evt.oldIndex!, 1);
                  newOrder.splice(evt.newIndex!, 0, removed);
                  
                  const productIds = newOrder.map(p => p.id);
                  updateSortMutation.mutate(productIds);
                }
              }
            });
            setSortableList(sortableInstance);
          }
        } catch (error) {
          console.error("Sortable 초기화 실패:", error);
        }
      }
    };

    // Use setTimeout to ensure DOM is ready
    const timeoutId = setTimeout(loadSortable, 100);

    return () => {
      clearTimeout(timeoutId);
      if (sortableList) {
        try {
          sortableList.destroy();
        } catch (error) {
          console.warn("Sortable cleanup failed:", error);
        }
        setSortableList(null);
      }
    };
  }, [products.length]);

  const formatLastChecked = (latestTrack: any) => {
    if (!latestTrack) return "미확인";
    
    const date = new Date(latestTrack.checkedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}시간 전`;
    return date.toLocaleDateString();
  };

  const getRankDisplay = (latestTrack: any) => {
    if (!latestTrack || !latestTrack.globalRank) {
      return { rank: "-", page: "미발견", change: "변동없음", color: "text-gray-400" };
    }

    const rank = latestTrack.globalRank;
    const page = Math.ceil(rank / 40);
    
    // Determine color based on rank
    let color = "text-gray-900";
    let change = "변동없음";
    
    if (rank <= 10) {
      color = "text-success";
      change = "순위 상승";
    } else if (rank <= 30) {
      color = "text-warning";
      change = "순위 유지";
    } else {
      color = "text-error";
      change = "순위 하락";
    }

    return { rank, page: `${page}페이지`, change, color };
  };

  const formatPrice = (priceKrw: number | null) => {
    if (!priceKrw) return "-";
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      minimumFractionDigits: 0,
    }).format(priceKrw);
  };

  const handleDeleteProduct = (product: any) => {
    if (window.confirm(`"${product.productName}" 제품을 정말 삭제하시겠습니까?`)) {
      deleteProductMutation.mutate(product.id);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center">로딩 중...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {section.includes("tracking") ? "추적 중인 제품" : "관리 제품"}
            </h3>
            <span className="text-sm text-gray-500" data-testid="text-product-count">
              {products.length}개 제품
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 rounded border border-gray-300 hover:bg-gray-50">
              <i className="fas fa-download mr-2"></i>내보내기
            </button>
            <button className="text-sm text-primary hover:text-blue-700 px-3 py-1 rounded border border-primary hover:bg-blue-50">
              <i className="fas fa-sync mr-2"></i>전체 새로고침
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <i className="fas fa-grip-vertical mr-2 text-gray-400"></i>제품 정보
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">추적 주기</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">진행상태</th>
                {section.includes("tracking") && (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">스토어명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제품 가격</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">현재 순위</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">순위 변동</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">마지막 확인</th>
                  </>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody id="sortable-products" className="bg-white divide-y divide-gray-200">
              {products.map((product: any) => {
                const rankDisplay = getRankDisplay(product.latestTrack);
                
                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors sortable-item" data-testid={`row-product-${product.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-start space-x-4">
                        <div className="drag-handle cursor-move text-gray-400 hover:text-gray-600 mt-1">
                          <i className="fas fa-grip-vertical"></i>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="text-sm font-medium text-gray-900" data-testid={`text-product-name-${product.id}`}>
                              {product.productName}
                            </h4>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              product.active ? "bg-success text-white" : "bg-gray-300 text-gray-700"
                            }`}>
                              {product.active ? "활성" : "비활성"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            키워드: <span data-testid={`text-keyword-${product.id}`}>{product.keyword}</span> | 
                            제품번호: <span data-testid={`text-product-no-${product.id}`}>{product.productNo}</span>
                          </p>
                          {product.latestTrack?.productLink && (
                            <a 
                              href={product.latestTrack.productLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:text-blue-700 mt-1 inline-block"
                              data-testid={`link-naver-${product.id}`}
                            >
                              <i className="fas fa-external-link-alt mr-1"></i>네이버 쇼핑에서 보기
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800">
                        {product.intervalMin}분
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {refreshingProducts.has(product.id) ? (
                          <div className="relative w-16 h-16">
                            {/* 정사각형 라운드 배경 */}
                            <div className="absolute inset-0 bg-gray-200 rounded-lg"></div>
                            {/* 파란색 채우기 효과 - 아래에서 위로 차오름 */}
                            <div className="absolute inset-0 overflow-hidden rounded-lg">
                              <div 
                                className="absolute bottom-0 left-0 right-0 bg-blue-500 transition-all duration-300 ease-out rounded-lg"
                                style={{ 
                                  height: `${refreshingProducts.get(product.id) || 0}%`
                                }}
                              ></div>
                            </div>
                            {/* 퍼센트 텍스트 */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold text-white drop-shadow-lg z-10">
                                {Math.round(refreshingProducts.get(product.id) || 0)}%
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-16 h-16 flex items-center justify-center">
                            <span className="text-gray-400 text-sm">-</span>
                          </div>
                        )}
                      </div>
                    </td>
                    {section.includes("tracking") && (
                      <>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900" data-testid={`text-store-name-${product.id}`}>
                            {product.latestTrack?.mallName || "-"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900" data-testid={`text-price-${product.id}`}>
                            {formatPrice(product.latestTrack?.priceKrw)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <span className={`text-2xl font-bold ${rankDisplay.color}`} data-testid={`text-rank-${product.id}`}>
                              {rankDisplay.rank}
                            </span>
                            <div className="text-xs text-gray-500">
                              <div>{rankDisplay.page}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1">
                            <i className={`fas ${
                              rankDisplay.change === "순위 상승" ? "fa-arrow-up text-success" :
                              rankDisplay.change === "순위 하락" ? "fa-arrow-down text-error" :
                              "fa-minus text-gray-400"
                            } text-sm`}></i>
                            <span className={`text-sm ${
                              rankDisplay.change === "순위 상승" ? "text-success" :
                              rankDisplay.change === "순위 하락" ? "text-error" :
                              "text-gray-500"
                            }`} data-testid={`text-rank-change-${product.id}`}>
                              {rankDisplay.change}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900" data-testid={`text-last-checked-${product.id}`}>
                            {formatLastChecked(product.latestTrack)}
                          </div>
                          {product.latestTrack && (
                            <div className="text-xs text-gray-500">
                              {new Date(product.latestTrack.checkedAt).toLocaleString()}
                            </div>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {section.includes("tracking") ? (
                          <>
                            <button 
                              onClick={() => refreshProductMutation.mutate(product.id)}
                              disabled={refreshProductMutation.isPending || refreshingProducts.has(product.id)}
                              className="p-2 text-gray-400 hover:text-primary rounded-md hover:bg-gray-100" 
                              title="수동 검색"
                              data-testid={`button-refresh-${product.id}`}
                            >
                              <i className={`fas fa-sync text-sm ${refreshingProducts.has(product.id) ? 'animate-spin' : ''}`}></i>
                            </button>
                            <button 
                              onClick={() => setSelectedProductId(product.id)}
                              className="p-2 text-gray-400 hover:text-primary rounded-md hover:bg-gray-100" 
                              title="통계 보기"
                              data-testid={`button-stats-${product.id}`}
                            >
                              <i className="fas fa-chart-line text-sm"></i>
                            </button>
                            <button 
                              onClick={() => toggleActiveMutation.mutate({ 
                                productId: product.id, 
                                active: !product.active 
                              })}
                              disabled={toggleActiveMutation.isPending}
                              className="p-2 text-gray-400 hover:text-error rounded-md hover:bg-gray-100" 
                              title={product.active ? "비활성화" : "활성화"}
                              data-testid={`button-toggle-${product.id}`}
                            >
                              <i className={`fas ${product.active ? "fa-pause" : "fa-play"} text-sm`}></i>
                            </button>
                          </>
                        ) : (
                          <>
                            {onEditProduct && (
                              <button 
                                onClick={() => onEditProduct(product)}
                                className="p-2 text-gray-400 hover:text-primary rounded-md hover:bg-gray-100" 
                                title="수정"
                                data-testid={`button-edit-${product.id}`}
                              >
                                <i className="fas fa-edit text-sm"></i>
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteProduct(product)}
                              disabled={deleteProductMutation.isPending}
                              className="p-2 text-gray-400 hover:text-error rounded-md hover:bg-gray-100" 
                              title="삭제"
                              data-testid={`button-delete-${product.id}`}
                            >
                              <i className="fas fa-trash text-sm"></i>
                            </button>
                            <button 
                              onClick={() => toggleActiveMutation.mutate({ 
                                productId: product.id, 
                                active: !product.active 
                              })}
                              disabled={toggleActiveMutation.isPending}
                              className="p-2 text-gray-400 hover:text-warning rounded-md hover:bg-gray-100" 
                              title={product.active ? "비활성화" : "활성화"}
                              data-testid={`button-toggle-${product.id}`}
                            >
                              <i className={`fas ${product.active ? "fa-pause" : "fa-play"} text-sm`}></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {products.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <i className="fas fa-inbox text-4xl mb-4 text-gray-300"></i>
            <p className="text-lg font-medium mb-2">등록된 제품이 없습니다</p>
            <p className="mb-4">첫 번째 제품을 추가해보세요</p>
            <button 
              onClick={onAddProduct}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-blue-700"
              data-testid="button-add-first-product"
            >
              제품 추가하기
            </button>
          </div>
        )}

        {/* Pagination */}
        {products.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              총 <span className="font-medium">{products.length}</span>개 중 
              <span className="font-medium"> 1-{products.length}</span>개 표시
            </div>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-500 hover:bg-gray-50 disabled:opacity-50" disabled>
                이전
              </button>
              <button className="px-3 py-2 text-sm bg-primary text-white rounded-md">1</button>
              <button className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" disabled>
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedProductId && (
        <StatisticsModal 
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </>
  );
}
