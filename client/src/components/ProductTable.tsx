import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import StatisticsModal from "./StatisticsModal";
import WeeklyTrendChart from "./WeeklyTrendChart";
import { useToast } from "@/hooks/use-toast";

// 1주일 트렌드 차트를 위한 래퍼 컴포넌트
function WeeklyTrendChartWrapper({ productId }: { productId: number }) {
  const { data: weeklyData, isLoading } = useQuery({
    queryKey: [`/products/${productId}/weekly-ranks`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/products/${productId}/weekly-ranks`);
      return await response.json();
    },
    staleTime: 1000 * 60 * 5, // 5분 캐시 (수동/자동 검색 시 즉시 무효화됨)
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="w-20 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded animate-pulse">
        <div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
    );
  }

  if (!weeklyData?.dailyRanks) {
    return (
      <div className="w-20 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
      </div>
    );
  }

  return (
    <WeeklyTrendChart 
      productId={productId} 
      dailyRanks={weeklyData.dailyRanks} 
    />
  );
}

interface ProductTableProps {
  section: string;
  searchQuery?: string;
  statusFilter?: string;
  onAddProduct: () => void;
  onEditProduct?: (product: any) => void;
}

export default function ProductTable({ section, searchQuery = "", statusFilter = "all", onAddProduct, onEditProduct }: ProductTableProps) {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [sortableList, setSortableList] = useState<any>(null);
  const [refreshingProducts, setRefreshingProducts] = useState<Map<number, number>>(new Map()); // productId -> progress percentage
  const [bulkRefreshInProgress, setBulkRefreshInProgress] = useState(false);
  const [bulkRefreshProgress, setBulkRefreshProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState<any>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 스마트 검색 상태 조회 (진행 중일 때만 자주 확인)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let lastStatusTime = 0;
    
    const fetchSearchStatus = async () => {
      try {
        const response = await apiRequest("GET", "/search-status");
        const status = await response.json();
        
        // 이전 상태와 비교하여 완료된 검색이 있는지 확인
        if (searchStatus && searchStatus.activeSearches) {
          const completedSearches = status.activeSearches.filter((current: any) => 
            current.status === 'completed' && 
            !searchStatus.activeSearches.some((prev: any) => 
              prev.productId === current.productId && prev.status === 'completed'
            )
          );
          
          // 완료된 검색들의 주간 트렌드 캐시 무효화
          completedSearches.forEach((search: any) => {
            queryClient.invalidateQueries({ queryKey: [`/products/${search.productId}/weekly-ranks`] });
          });
        }
        
        setSearchStatus(status);
        
        // 동적 간격 설정
        const isSearching = status.isProcessing || status.activeSearches.length > 0;
        const hasManualRefresh = refreshingProducts.size > 0;
        
        // 검색 중이면 빠르게, 아니면 느리게
        let nextInterval = 10000; // 기본 10초
        if (isSearching || hasManualRefresh) {
          nextInterval = 2000; // 검색 중일 때는 2초
        }
        
        // 브라우저가 백그라운드에 있으면 더 느리게
        if (document.hidden) {
          nextInterval *= 3;
        }
        
        // 다음 호출 스케줄링
        if (interval) clearTimeout(interval);
        interval = setTimeout(fetchSearchStatus, nextInterval);
        
      } catch (error) {
        console.error("검색 상태 조회 실패:", error);
        // 에러 시 15초 후 재시도
        if (interval) clearTimeout(interval);
        interval = setTimeout(fetchSearchStatus, 15000);
      }
    };

    fetchSearchStatus(); // 초기 조회

    return () => {
      if (interval) clearTimeout(interval);
    };
  }, [queryClient, refreshingProducts.size]); // 수동 검색 상태도 고려

  // Determine filters based on section
  const getFilters = () => {
    const isTracking = section.includes("tracking");
    const type = section.includes("ad") ? "ad" : "organic";
    return { type, active: isTracking };
  };

  const { data: allProducts = [], isLoading } = useQuery({
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

  // 검색 및 상태 필터링
  const products = allProducts.filter((product: any) => {
    // 광고 타입 제품 완전히 제외
    if (product.type === "ad") {
      return false;
    }

    // 검색 필터링
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const productName = product.productName.toLowerCase();
      const keyword = product.keyword.toLowerCase();
      const productNo = product.productNo.toLowerCase();
      
      const matchesSearch = productName.includes(query) || 
                          keyword.includes(query) || 
                          productNo.includes(query);
      if (!matchesSearch) return false;
    }

    // 상태 필터링
    if (statusFilter !== "all") {
      if (statusFilter === "active" && !product.active) return false;
      if (statusFilter === "inactive" && product.active) return false;
    }

    return true;
  });

  const refreshProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      // Start progress simulation
      const startTime = Date.now();
      startProgressSimulation(productId);
      
      const response = await apiRequest("POST", `/products/${productId}/refresh`);
      const result = await response.json();
      
      // 검색 완료 - 최소 3초 보장 (빠른 사용자 경험)
      const elapsed = Date.now() - startTime;
      const minDuration = 3000; // 3초로 단축
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }
      
      return result;
    },
    onSuccess: (data, productId) => {
      // 100% 완료 애니메이션 (부드럽게 85% → 100%)
      let currentProgress = refreshingProducts.get(productId) || 85;
      const animateToComplete = () => {
        currentProgress += 5;
        if (currentProgress >= 100) currentProgress = 100;
        
        setRefreshingProducts(prev => {
          const newMap = new Map(prev);
          newMap.set(productId, currentProgress);
          return newMap;
        });
        
        if (currentProgress < 100) {
          setTimeout(animateToComplete, 100); // 0.1초마다
        } else {
          // 100% 완료 후 실제 데이터 확인 방식으로 UI 업데이트
          verifyAndUpdateData(productId);
        }
      };
      
      animateToComplete();
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

  // 실서버 안정성 - 데이터 검증 및 강제 업데이트
  const verifyAndUpdateData = async (productId: number) => {
    let attempts = 0;
    const maxAttempts = 10; // 최대 10회 시도
    
    const checkData = async (): Promise<void> => {
      attempts++;
      
      try {
        // 캐시를 완전히 무시하고 새로운 데이터 강제 요청
        const params = new URLSearchParams();
        const filters = getFilters();
        if (filters.type) params.append("type", filters.type);
        if (filters.active !== undefined) params.append("active", filters.active.toString());
        
        // 타임스탬프 추가로 캐시 완전 무효화
        params.append("_t", Date.now().toString());
        
        const response = await apiRequest("GET", `/products?${params}`);
        const freshData = await response.json();
        
        // 해당 제품의 최신 트랙 데이터 확인
        const updatedProduct = freshData.find((p: any) => p.id === productId);
        
        if (updatedProduct && updatedProduct.latestTrack && updatedProduct.latestTrack.id) {
          // 데이터 확인됨 - UI 업데이트
          const currentFilters = getFilters();
          queryClient.setQueryData(["/products", currentFilters], freshData);
          
          // 주간 트렌드 캐시 무효화 (새로운 검색 결과 반영)
          queryClient.invalidateQueries({ queryKey: [`/products/${productId}/weekly-ranks`] });
          
          toast({
            title: "수동 검색 완료",
            description: `순위 정보가 업데이트되었습니다. (${updatedProduct.latestTrack.globalRank ? updatedProduct.latestTrack.globalRank + '위' : '미발견'})`,
          });
          
          // 진행률 제거
          setTimeout(() => {
            setRefreshingProducts(prev => {
              const newMap = new Map(prev);
              newMap.delete(productId);
              return newMap;
            });
          }, 1500);
          
          return; // 성공 완료
        }
        
        // 데이터 없음 - 재시도
        if (attempts < maxAttempts) {
          setTimeout(() => checkData(), 1000); // 1초 후 재시도
        } else {
          // 최대 시도 횟수 초과
          toast({
            title: "검색 완료",
            description: "검색이 완료되었지만 결과를 불러오는데 시간이 걸립니다. 잠시 후 새로고침해주세요.",
            variant: "destructive",
          });
          
          // 진행률 제거
          setRefreshingProducts(prev => {
            const newMap = new Map(prev);
            newMap.delete(productId);
            return newMap;
          });
        }
        
      } catch (error) {
        console.error('데이터 확인 오류:', error);
        
        if (attempts < maxAttempts) {
          setTimeout(() => checkData(), 1000);
        } else {
          toast({
            title: "검색 실패",
            description: "데이터를 불러오는데 실패했습니다.",
            variant: "destructive",
          });
          
          setRefreshingProducts(prev => {
            const newMap = new Map(prev);
            newMap.delete(productId);
            return newMap;
          });
        }
      }
    };
    
    // 1초 후 시작 (서버 처리 시간 고려)
    setTimeout(() => checkData(), 1000);
  };

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
    onMutate: async (productIds: number[]) => {
      // 낙관적 업데이트를 위해 진행 중인 쿼리 취소
      const currentFilters = getFilters();
      await queryClient.cancelQueries({ queryKey: ["/products", currentFilters] });

      // 이전 데이터 백업
      const previousProducts = queryClient.getQueryData(["/products", currentFilters]);

      // 새로운 순서로 즉시 UI 업데이트
      if (previousProducts) {
        const orderedProducts = productIds.map(id => 
          (previousProducts as any[]).find(p => p.id === id)
        ).filter(Boolean);
        
        queryClient.setQueryData(["/products", currentFilters], orderedProducts);
      }

      return { previousProducts };
    },
    onError: (err, productIds, context) => {
      // 에러 발생 시 이전 데이터로 롤백
      if (context?.previousProducts) {
        const currentFilters = getFilters();
        queryClient.setQueryData(["/products", currentFilters], context.previousProducts);
      }
      
      toast({
        title: "정렬 실패",
        description: "제품 순서 변경에 실패했습니다.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // 서버와 동기화 (선택사항: 너무 자주 호출되지 않도록 주의)
      // const currentFilters = getFilters();
      // queryClient.invalidateQueries({ queryKey: ["/products", currentFilters] });
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

  // Progress simulation - 실서버 안정성 최적화
  const startProgressSimulation = (productId: number) => {
    let progress = 0;
    
    const updateProgress = () => {
      progress += Math.random() * 15 + 10; // 10-25% 더 빠른 증가
      if (progress > 85) progress = 85; // 85%에서 대기
      
      setRefreshingProducts(prev => {
        const newMap = new Map(prev);
        newMap.set(productId, Math.floor(progress));
        return newMap;
      });
      
      if (progress < 85) {
        setTimeout(updateProgress, Math.random() * 300 + 150); // 150-450ms 더 빠른 간격
      }
    };
    
    updateProgress();
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
              ghostClass: "sortable-ghost",
              chosenClass: "sortable-chosen",
              dragClass: "sortable-drag",
              onEnd: (evt: any) => {
                if (evt.oldIndex !== evt.newIndex && !updateSortMutation.isPending) {
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
  }, [products.length, updateSortMutation.isPending]);

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

  const getRankDisplay = (latestTrack: any, product: any) => {
    if (!latestTrack || !latestTrack.globalRank) {
      return { rank: "-", page: "미발견", change: "변동없음", color: "text-gray-400 dark:text-gray-500", changeColor: "text-gray-500 dark:text-gray-400" };
    }

    const rank = latestTrack.globalRank;
    const page = Math.ceil(rank / 40);
    
    // 기본 순위 색상 (순위 값 자체에 따른 색상)
    let color = "text-gray-900 dark:text-gray-100";
    if (rank <= 10) {
      color = "text-success";
    } else if (rank <= 30) {
      color = "text-warning";
    } else {
      color = "text-error";
    }

    // 이전 순위와 비교하여 변동량 계산
    let change = "변동없음";
    let changeColor = "text-gray-500 dark:text-gray-400";
    
    // 제품의 모든 트랙 데이터에서 이전 순위 찾기
    if (product.tracks && product.tracks.length >= 2) {
      // 최신 순으로 정렬 (최신이 첫번째)
      const sortedTracks = [...product.tracks].sort((a, b) => 
        new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      );
      
      const currentTrack = sortedTracks[0]; // 최신 트랙
      const previousTrack = sortedTracks[1]; // 이전 트랙
      
      if (currentTrack.globalRank && previousTrack.globalRank) {
        const currentRank = currentTrack.globalRank;
        const previousRank = previousTrack.globalRank;
        const rankDiff = previousRank - currentRank; // 이전 순위 - 현재 순위
        
        if (rankDiff > 0) {
          // 순위 상승 (숫자가 작아짐)
          change = `🔺상승${rankDiff}`;
          changeColor = "text-green-600 dark:text-green-400";
        } else if (rankDiff < 0) {
          // 순위 하락 (숫자가 커짐)
          change = `🔻하락${Math.abs(rankDiff)}`;
          changeColor = "text-red-600 dark:text-red-400";
        } else {
          // 순위 변동 없음
          change = "🔄변동없음";
          changeColor = "text-gray-500 dark:text-gray-400";
        }
      }
    }

    return { rank, page: `${page}페이지`, change, color, changeColor };
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

  // 전체 새로고침 순차 실행 기능
  const handleBulkRefresh = async () => {
    if (products.length === 0 || bulkRefreshInProgress) return;
    
    setBulkRefreshInProgress(true);
    setBulkRefreshProgress(0);
    
    try {
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        setBulkRefreshProgress(i + 1);
        
        try {
          await new Promise((resolve, reject) => {
            const mutation = refreshProductMutation.mutate(product.id, {
              onSuccess: resolve,
              onError: reject,
            });
          });
        } catch (error) {
          console.error(`제품 ${product.productName} 새로고침 실패:`, error);
          // 에러가 발생해도 계속 진행
        }
        
        // 각 제품 간 1초 대기 (서버 부하 방지)
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      toast({
        title: "전체 새로고침 완료",
        description: `${products.length}개 제품의 순위 업데이트가 완료되었습니다.`,
      });
    } catch (error) {
      toast({
        title: "전체 새로고침 실패",
        description: "일부 제품 업데이트 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setBulkRefreshInProgress(false);
      setBulkRefreshProgress(0);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="text-center text-gray-900 dark:text-gray-100">로딩 중...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {section.includes("tracking") ? "추적 중인 제품" : "관리 제품"}
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" data-testid="text-product-count">
              {products.length}개 제품
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {/* <button className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-100 px-3 py-1 rounded border border-gray-300 hover:bg-gray-50">
              <i className="fas fa-download mr-2"></i>내보내기
            </button> */}
            <button 
              className="text-sm text-primary hover:text-blue-700 px-3 py-1 rounded border border-primary hover:bg-blue-50"
              onClick={handleBulkRefresh}
              disabled={bulkRefreshInProgress}
              data-testid="button-bulk-refresh"
            >
              <i className="fas fa-sync mr-2"></i>
              {bulkRefreshInProgress ? `새로고침 중... (${bulkRefreshProgress}/${products.length})` : "전체 새로고침"}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <i className="fas fa-grip-vertical mr-2 text-gray-400 dark:text-gray-500"></i>제품 정보
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">추적 주기</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">진행상태</th>
                {section.includes("tracking") && (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">스토어명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">제품 가격</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">현재 순위</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">순위 변동</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">1주일 트렌드</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">마지막 확인</th>
                  </>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-300 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody id="sortable-products" className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
              {products.map((product: any) => {
                const rankDisplay = getRankDisplay(product.latestTrack, product);
                
                return (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors sortable-item" data-testid={`row-product-${product.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-start space-x-4">
                        <div className="drag-handle cursor-move text-gray-400 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 dark:text-gray-500 mt-1">
                          <i className="fas fa-grip-vertical"></i>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100" data-testid={`text-product-name-${product.id}`}>
                              {product.productName}
                            </h4>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              product.active ? "bg-success text-white" : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                            }`}>
                              {product.active ? "활성" : "비활성"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
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
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        {product.intervalMin}분
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {(() => {
                          // 수동 검색 진행상태 확인
                          const isManualRefreshing = refreshingProducts.has(product.id);
                          let progress = 0;
                          let progressText = "";
                          let progressColor = "bg-blue-500";
                          
                          // 자동 검색 진행상태 확인
                          const autoSearch = searchStatus?.activeSearches?.find((s: any) => s.productId === product.id);
                          
                          if (isManualRefreshing) {
                            // 수동 검색 중
                            progress = refreshingProducts.get(product.id) || 0;
                            progressText = `${Math.round(progress)}%`;
                            progressColor = "bg-blue-500";
                          } else if (autoSearch && autoSearch.status !== 'completed') {
                            // 자동 검색 중
                            if (autoSearch.status === 'searching') {
                              progress = 50; // 검색 중일 때는 50%로 표시
                              progressText = "자동";
                              progressColor = "bg-green-500";
                            } else if (autoSearch.status === 'retrying') {
                              progress = 25; // 재시도 중일 때는 25%로 표시
                              progressText = "재시도";
                              progressColor = "bg-yellow-500";
                            } else if (autoSearch.status === 'failed') {
                              progress = 100; // 실패 시 100%로 표시
                              progressText = "실패";
                              progressColor = "bg-red-500";
                            }
                          }
                          
                          if (progress > 0) {
                            return (
                              <div className="relative w-16 h-16">
                                {/* 정사각형 라운드 배경 */}
                                <div className="absolute inset-0 bg-gray-200 dark:bg-gray-600 rounded-lg"></div>
                                {/* 채우기 효과 - 아래에서 위로 차오름 */}
                                <div className="absolute inset-0 overflow-hidden rounded-lg">
                                  <div 
                                    className={`absolute bottom-0 left-0 right-0 ${progressColor} transition-all duration-300 ease-out rounded-lg`}
                                    style={{ 
                                      height: `${progress}%`
                                    }}
                                  ></div>
                                </div>
                                {/* 텍스트 */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-sm font-bold text-white drop-shadow-lg z-10">
                                    {progressText}
                                  </span>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div className="w-16 h-16 flex items-center justify-center">
                                <span className="text-gray-400 dark:text-gray-500 text-sm">-</span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </td>
                    {section.includes("tracking") && (
                      <>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100" data-testid={`text-store-name-${product.id}`}>
                            {product.latestTrack?.mallName || "-"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100" data-testid={`text-price-${product.id}`}>
                            {formatPrice(product.latestTrack?.priceKrw)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <span className={`text-2xl font-bold ${rankDisplay.color}`} data-testid={`text-rank-${product.id}`}>
                              {rankDisplay.rank}
                              {product.latestTrack?.rankOnPage && (
                                <span className="text-sm text-gray-500 dark:text-gray-400 ml-1 font-normal">
                                  ({product.latestTrack.rankOnPage})
                                </span>
                              )}
                            </span>
                            <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
                              <div>{rankDisplay.page}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1">
                            <span className={`text-sm ${rankDisplay.changeColor} flex items-center`} data-testid={`text-rank-change-${product.id}`}>
                              {rankDisplay.change}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <WeeklyTrendChartWrapper productId={product.id} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100" data-testid={`text-last-checked-${product.id}`}>
                            {formatLastChecked(product.latestTrack)}
                          </div>
                          {product.latestTrack && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
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
                              className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary rounded-md hover:bg-gray-100" 
                              title="수동 검색"
                              data-testid={`button-refresh-${product.id}`}
                            >
                              <i className={`fas fa-sync text-sm ${refreshingProducts.has(product.id) ? 'animate-spin' : ''}`}></i>
                            </button>
                            <button 
                              onClick={() => setSelectedProductId(product.id)}
                              className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary rounded-md hover:bg-gray-100" 
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
                              className="p-2 text-gray-400 dark:text-gray-500 hover:text-error rounded-md hover:bg-gray-100" 
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
                                className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary rounded-md hover:bg-gray-100" 
                                title="수정"
                                data-testid={`button-edit-${product.id}`}
                              >
                                <i className="fas fa-edit text-sm"></i>
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteProduct(product)}
                              disabled={deleteProductMutation.isPending}
                              className="p-2 text-gray-400 dark:text-gray-500 hover:text-error rounded-md hover:bg-gray-100" 
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
                              className="p-2 text-gray-400 dark:text-gray-500 hover:text-warning rounded-md hover:bg-gray-100" 
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
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500">
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
              <button className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-50 disabled:opacity-50" disabled>
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
