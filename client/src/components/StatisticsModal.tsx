import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface StatisticsModalProps {
  productId: number;
  onClose: () => void;
}

export default function StatisticsModal({ productId, onClose }: StatisticsModalProps) {
  // 한국시간 기준으로 날짜 계산
  const getKSTDate = (offsetDays = 0) => {
    const now = new Date();
    const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000));
    return kstNow.toISOString().split('T')[0];
  };

  const [dateRange, setDateRange] = useState({
    from: getKSTDate(-30), // 30일 전 (한국시간)
    to: getKSTDate(0), // 오늘 (한국시간)
  });
  
  const [chart, setChart] = useState<any>(null);
  const { toast } = useToast();

  // 날짜 범위 제한 (3년) - 한국시간 기준
  const maxDate = getKSTDate(0);
  const minDate = getKSTDate(-365 * 3);

  // 제품 정보 가져오기
  const { data: product } = useQuery({
    queryKey: ["/products", productId],
    queryFn: async () => {
      const response = await apiRequest("GET", "/products");
      const products = await response.json();
      return products.find((p: any) => p.id === productId);
    },
  });

  const { data: tracks = [] } = useQuery({
    queryKey: ["/tracks", productId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const params = new URLSearchParams({
        product_id: productId.toString(),
        from: dateRange.from,
        to: dateRange.to,
      });
      
      const response = await apiRequest("GET", `/tracks?${params}`);
      return await response.json();
    },
  });

  // Initialize chart when tracks change
  useEffect(() => {
    const initChart = async () => {
      if (tracks.length > 0) {
        // Dynamically import Chart.js
        const Chart = (await import("chart.js/auto")).default;
        
        const ctx = document.getElementById("rank-chart") as HTMLCanvasElement;
        if (ctx) {
          // Destroy existing chart
          if (chart) {
            chart.destroy();
          }

          // 한국시간 기준으로 날짜별 데이터 그룹화 (24:00마다 새로운 선)
          const dateGroups = new Map();
          
          tracks
            .filter((track: any) => track.globalRank)
            .forEach((track: any) => {
              // 한국시간 기준 날짜 추출
              const trackDate = new Date(track.checkedAt);
              const kstDate = new Date(trackDate.getTime() + (9 * 60 * 60 * 1000));
              const dateKey = kstDate.toISOString().split('T')[0];
              
              if (!dateGroups.has(dateKey)) {
                dateGroups.set(dateKey, []);
              }
              dateGroups.get(dateKey).push({
                x: kstDate.toLocaleString('ko-KR'),
                y: track.globalRank
              });
            });

          // 일별로 다른 색상의 dataset 생성
          const colors = [
            { border: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
            { border: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
            { border: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' },
            { border: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' },
            { border: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.1)' },
            { border: '#06B6D4', bg: 'rgba(6, 182, 212, 0.1)' },
            { border: '#F97316', bg: 'rgba(249, 115, 22, 0.1)' }
          ];

          const datasets = Array.from(dateGroups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data], index) => {
              const color = colors[index % colors.length];
              return {
                label: `${date} (${data.length}건)`,
                data: data.sort((a: any, b: any) => new Date(a.x).getTime() - new Date(b.x).getTime()),
                borderColor: color.border,
                backgroundColor: color.bg,
                tension: 0.3,
                fill: false,
                pointRadius: 3,
                pointHoverRadius: 5,
              };
            });

          // 다크모드 감지
          const isDarkMode = document.documentElement.classList.contains('dark');
          const textColor = isDarkMode ? '#e5e7eb' : '#374151';
          const gridColor = isDarkMode ? '#4b5563' : '#e5e7eb';

          const newChart = new Chart(ctx, {
            type: "line",
            data: {
              datasets
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  reverse: true, // Lower rank numbers appear higher
                  beginAtZero: false,
                  min: 1,
                  max: 200,
                  title: {
                    display: true,
                    text: "순위 (낮을수록 상위)",
                    color: textColor,
                    font: {
                      size: 12
                    }
                  },
                  ticks: {
                    color: textColor
                  },
                  grid: {
                    color: gridColor
                  }
                },
                x: {
                  title: {
                    display: true,
                    text: "날짜",
                    color: textColor,
                    font: {
                      size: 12
                    }
                  },
                  ticks: {
                    color: textColor
                  },
                  grid: {
                    color: gridColor
                  }
                }
              },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: {
                    boxWidth: 12,
                    padding: 15,
                    color: textColor,
                    font: {
                      size: 11
                    }
                  }
                },
                tooltip: {
                  backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                  titleColor: textColor,
                  bodyColor: textColor,
                  borderColor: isDarkMode ? '#4b5563' : '#e5e7eb',
                  borderWidth: 1,
                  callbacks: {
                    title: function(context: any) {
                      return context[0].dataset.label;
                    },
                    label: function(context: any) {
                      return `순위: ${context.parsed.y}위`;
                    }
                  }
                }
              }
            }
          });
          
          setChart(newChart);
        }
      }
    };

    initChart();

    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  }, [tracks]);

  // Calculate statistics
  const ranks = tracks.filter((t: any) => t.globalRank).map((t: any) => t.globalRank);
  const stats = {
    best: ranks.length > 0 ? Math.min(...ranks) : 0,
    worst: ranks.length > 0 ? Math.max(...ranks) : 0,
    average: ranks.length > 0 ? (ranks.reduce((a: number, b: number) => a + b, 0) / ranks.length).toFixed(1) : 0,
    foundRate: tracks.length > 0 ? ((ranks.length / tracks.length) * 100).toFixed(0) : 0,
  };

  const handleDateUpdate = () => {
    // 한국시간 기준으로 날짜 검증
    const fromDate = new Date(dateRange.from + 'T09:00:00.000Z'); // 한국시간으로 변환
    const toDate = new Date(dateRange.to + 'T09:00:00.000Z'); // 한국시간으로 변환
    const diffInDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays > 1095) { // 3년 = 365 * 3 = 1095일
      toast({
        title: "기간 설정 오류",
        description: "검색 기간은 최대 3년(1095일)까지 설정 가능합니다. 다시 설정해 주세요.",
        variant: "destructive",
      });
      return;
    }

    if (fromDate > toDate) {
      toast({
        title: "날짜 설정 오류", 
        description: "시작일이 종료일보다 늦을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    // Query will automatically refetch due to dependency change
  };

  // 빠른 기간 선택 함수 (한국시간 기준)
  const handleQuickRange = (days: number) => {
    setDateRange({
      from: getKSTDate(-days),
      to: getKSTDate(0),
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2" data-testid="statistics-modal">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[95vw] max-w-[1200px] h-[95vh] max-h-[680px] overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">순위 통계</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{product?.productName || `제품 #${productId}`}</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            data-testid="button-close-modal"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Date Range Picker */}
          <div className="flex flex-col space-y-2 mb-4">
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">기간:</label>
                <div className="relative">
                  <input 
                    type="date" 
                    className="border border-gray-300 dark:border-gray-600 rounded-md pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                    value={dateRange.from}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                    data-testid="input-date-from"
                  />
                  <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    📅
                  </div>
                </div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">~</span>
                <div className="relative">
                  <input 
                    type="date" 
                    className="border border-gray-300 dark:border-gray-600 rounded-md pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                    value={dateRange.to}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                    data-testid="input-date-to"
                  />
                  <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    📅
                  </div>
                </div>
              </div>
              <button 
                onClick={handleDateUpdate}
                className="px-3 py-1.5 bg-primary text-white rounded-md text-xs font-medium hover:bg-blue-700"
                data-testid="button-update-chart"
              >
                조회
              </button>
              
              {/* 빠른 기간 선택 버튼 */}
              <div className="flex items-center flex-wrap gap-1 border-l border-gray-300 dark:border-gray-600 pl-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">빠른선택:</span>
                <button 
                  onClick={() => handleQuickRange(7)}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  data-testid="button-quick-week"
                >
                  1주일
                </button>
                <button 
                  onClick={() => handleQuickRange(30)}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  data-testid="button-quick-month"
                >
                  30일
                </button>
                <button 
                  onClick={() => handleQuickRange(365)}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  data-testid="button-quick-year"
                >
                  1년
                </button>
                <button 
                  onClick={() => handleQuickRange(730)}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  data-testid="button-quick-2years"
                >
                  2년
                </button>
                <button 
                  onClick={() => handleQuickRange(1095)}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  data-testid="button-quick-3years"
                >
                  3년
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 ml-8">
              💡 통계 검색 기간은 최대 3년(1095일)까지 설정 가능합니다.
            </div>
          </div>

          {/* Chart */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <canvas id="rank-chart" width="1100" height="300"></canvas>
          </div>

          {/* Statistics Summary */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-success" data-testid="stat-best-rank">
                {stats.best || "-"}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">최고 순위</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-error" data-testid="stat-worst-rank">
                {stats.worst || "-"}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">최저 순위</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100" data-testid="stat-average-rank">
                {stats.average}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">평균 순위</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-primary" data-testid="stat-found-rate">
                {stats.foundRate}%
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">발견율</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
