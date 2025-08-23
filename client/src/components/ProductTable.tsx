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
      // VPS 실서버: 실제 완료 시에만 100%로 설정
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        newMap.set(productId, 100);
        return newMap;
      });
      
      // 즉시 데이터 갱신
      const currentFilters = getFilters();
      queryClient.invalidateQueries({ queryKey: ["/products", currentFilters] });
      queryClient.refetchQueries({ queryKey: ["/products", currentFilters] });
      
      // VPS 환경: progress 제거 전에 충분한 시간 대기
      setTimeout(() => {
        setRefreshingProducts(prev => {
          const newMap = new Map(prev);
          newMap.delete(productId);
          return newMap;
        });
        
        // 데이터 갱신 완료 후 토스트 표시 (VPS 안정성)
        toast({
          title: "수동 검색 완료",
          description: "제품 순위가 업데이트되었습니다.",
        });
      }, 2000); // VPS 환경에 맞게 더 긴 대기
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
      toast({
        title: "정렬 완료",
        description: "제품 순서가 업데이트되었습니다.",
      });
    },
  });

  const deleteMutation = useMutation({
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
        description: "제품이 삭제되었습니다.",
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

  // Progress simulation for visual feedback - VPS 실서버 환경 최적화
  const startProgressSimulation = (productId: number) => {
    setRefreshingProducts(prev => {
      const newMap = new Map(prev);
      newMap.set(productId, 0);
      return newMap;
    });

    const interval = setInterval(() => {
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(productId) || 0;
        // VPS 환경: 85%까지만 자동 증가, 나머지는 실제 응답 대기
        if (current < 85) {
          newMap.set(productId, current + Math.random() * 8);
        }
        return newMap;
      });
    }, 800); // VPS 환경에 맞게 더 느리게

    // VPS 실서버: 더 긴 타임아웃 (30초) 후 강제 정리
    setTimeout(() => {
      clearInterval(interval);
      // 타임아웃 시 progress 완전 제거 (실서버 안정성)
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        newMap.delete(productId);
        return newMap;
      });
    }, 30000);
  };

  // Initialize sortable functionality for drag & drop
  useEffect(() => {
    const loadSortable = async () => {
      // 기존 인스턴스 제거
      if (sortableList) {
        try {
          if (sortableList.el && document.body.contains(sortableList.el)) { // ⚠️ 수정 금지: 실서버에서 DOM null 방지용
            sortableList.destroy(); // ⚠️ 수정 금지: 실서버 크래시 방지
          } else {
            console.warn("🧹 Sortable cleanup skipped: el is null or detached");
          }
        } catch (error) {
          console.warn("⚠️ Sortable cleanup failed:", error);
        }
        setSortableList(null);
      }

      // 새 인스턴스 생성
      if (products.length > 0) {
        try {
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
              },
            });
            setSortableList(sortableInstance);
          }
        } catch (error) {
          console.error("Sortable 초기화 실패:", error);
        }
      }
    };

    const timeoutId = setTimeout(loadSortable, 100); // 리플릿 환경에서도 안전하게 DOM 준비 대기

    return () => {
      clearTimeout(timeoutId);
      if (sortableList) {
        try {
          if (sortableList.el && document.body.contains(sortableList.el)) { // ⚠️ 수정 금지: 실서버에서 DOM 제거 후 접근 방지
            sortableList.destroy(); // ⚠️ 수정 금지: 실서버 오류 예방을 위한 destroy 안전 호출
          } else {
            console.warn("🧹 Cleanup skipped: Sortable element already gone");
          }
        } catch (error) {
          console.warn("⚠️ Sortable cleanup failed:", error);
        }
        setSortableList(null);
      }
    };
  }, [products.length]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  const handleEdit = (product: any) => {
    if (onEditProduct) {
      onEditProduct(product);
    }
  };

  const handleToggleActive = (productId: number, currentActive: boolean) => {
    toggleActiveMutation.mutate({ productId, active: !currentActive });
  };

  const handleRefresh = (productId: number) => {
    refreshProductMutation.mutate(productId);
  };

  const handleDelete = (productId: number) => {
    if (confirm("정말 이 제품을 삭제하시겠습니까?")) {
      deleteMutation.mutate(productId);
    }
  };

  const handleStatistics = (productId: number) => {
    setSelectedProductId(productId);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center py-8">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">
          {section === "organic-tracking" && "추적 중인 제품"}
          {section === "organic-all" && "일반 제품 관리"}
          {section === "ad-tracking" && "광고 추적 중인 제품"}
          {section === "ad-all" && "광고 제품 관리"}
          <span className="text-sm font-normal text-gray-500 ml-2">
            {products.length}개 제품
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onAddProduct}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
            data-testid="button-add-product"
          >
            <span>+</span>
            제품 추가
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          등록된 제품이 없습니다.
        </div>
      ) : (
        <div className="space-y-4" id="sortable-products">
          {products.map((product: any) => {
            const refreshProgress = refreshingProducts.get(product.id);
            const isRefreshing = refreshProgress !== undefined;
            
            return (
              <div key={product.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  {/* 왼쪽: 제품 정보 */}
                  <div className="flex items-center gap-4">
                    <div className="drag-handle cursor-move text-gray-400 hover:text-gray-600">
                      ≡
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                        product.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {product.active ? '추적' : '대기'}
                      </span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{product.productName}</h3>
                        <div className="text-sm text-gray-600">
                          키워드: {product.keyword} | 제품번호: {product.productNo}
                        </div>
                        <div className="text-xs text-gray-500">
                          추적 주기: {product.intervalMin}분
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 가운데: 순위 및 가격 정보 */}
                  <div className="text-center">
                    {isRefreshing ? (
                      <div className="space-y-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${refreshProgress}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-blue-600 font-medium">
                          검색 중 {Math.round(refreshProgress)}%
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {product.latestTrack?.globalRank ? (
                          <>
                            <div className="text-2xl font-bold text-blue-600">
                              {product.latestTrack.globalRank}위
                            </div>
                            {product.latestTrack?.priceKrw && (
                              <div className="text-lg font-semibold text-green-600">
                                ₩{formatPrice(product.latestTrack.priceKrw)}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-lg font-medium text-gray-400">미발견</div>
                        )}
                        {product.latestTrack?.checkedAt && (
                          <div className="text-xs text-gray-500">
                            {formatDateTime(product.latestTrack.checkedAt)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 오른쪽: 액션 버튼들 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefresh(product.id)}
                      disabled={isRefreshing}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 transition-colors"
                      title="수동 검색"
                      data-testid={`button-refresh-${product.id}`}
                    >
                      🔄
                    </button>
                    <button
                      onClick={() => handleStatistics(product.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="통계"
                      data-testid={`button-statistics-${product.id}`}
                    >
                      📊
                    </button>
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="수정"
                      data-testid={`button-edit-${product.id}`}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleToggleActive(product.id, product.active)}
                      className={`p-2 rounded-lg transition-colors ${
                        product.active 
                          ? 'text-red-600 hover:bg-red-50' 
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={product.active ? "추적 중지" : "추적 시작"}
                      data-testid={`button-toggle-${product.id}`}
                    >
                      {product.active ? '⏸️' : '▶️'}
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="삭제"
                      data-testid={`button-delete-${product.id}`}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {products.length > 0 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <span className="text-sm text-gray-600">
            총 {products.length}개 중 1-{Math.min(products.length, 1)}개 표시
          </span>
          <div className="flex gap-1">
            <button className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50">
              이전
            </button>
            <button className="px-3 py-1 bg-blue-500 text-white rounded">
              1
            </button>
            <button className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50">
              다음
            </button>
          </div>
        </div>
      )}

      {/* Statistics Modal */}
      {selectedProductId && (
        <StatisticsModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}