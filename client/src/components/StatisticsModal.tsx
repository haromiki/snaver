import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface StatisticsModalProps {
  productId: number;
  onClose: () => void;
}

export default function StatisticsModal({ productId, onClose }: StatisticsModalProps) {
  // 한국 표준 시간(KST) 기준으로 날짜 계산
  const getKSTDate = (offsetDays = 0) => {
    const now = new Date();
    const kstNow = new Date(now.getTime() + (offsetDays * 24 * 60 * 60 * 1000));
    return kstNow.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\. /g, '-').replace(/\./g, '');
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

  // 기간별 적응형 그룹화 함수 (메모리 저장된 기준 적용)
  const getAdaptiveGroupedData = (tracks: any[], fromDate: string, toDate: string) => {
    if (tracks.length === 0) return [];

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffInDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

    // 한국 시간 기준으로 데이터 필터링 및 변환
    const kstTracks = tracks
      .filter((track: any) => track.globalRank)
      .map((track: any) => {
        const kstDate = new Date(track.checkedAt);
        return {
          ...track,
          kstDate,
          rank: track.globalRank
        };
      })
      .sort((a, b) => a.kstDate.getTime() - b.kstDate.getTime());

    let groupedData: any[] = [];

    if (diffInDays <= 30) {
      // 1개월 이하: 일별 평균
      const dailyGroups = new Map();
      kstTracks.forEach(track => {
        const dayKey = track.kstDate.toISOString().split('T')[0];
        if (!dailyGroups.has(dayKey)) {
          dailyGroups.set(dayKey, []);
        }
        dailyGroups.get(dayKey).push(track.rank);
      });

      groupedData = Array.from(dailyGroups.entries()).map(([date, ranks]) => ({
        label: new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        value: Math.round(ranks.reduce((sum: number, rank: number) => sum + rank, 0) / ranks.length),
        date
      }));

    } else if (diffInDays <= 90) {
      // 3개월 이하: 주별 평균 (월요일 기준)
      const weeklyGroups = new Map();
      kstTracks.forEach(track => {
        const date = track.kstDate;
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(date);
        weekStart.setDate(diff);
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeklyGroups.has(weekKey)) {
          weeklyGroups.set(weekKey, []);
        }
        weeklyGroups.get(weekKey).push(track.rank);
      });

      groupedData = Array.from(weeklyGroups.entries()).map(([date, ranks]) => ({
        label: new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        value: Math.round(ranks.reduce((sum: number, rank: number) => sum + rank, 0) / ranks.length),
        date
      }));

    } else if (diffInDays <= 180) {
      // 6개월 이하: 2주별 평균
      const biweeklyGroups = new Map();
      kstTracks.forEach(track => {
        const date = track.kstDate;
        const weekNumber = Math.floor(date.getDate() / 14);
        const biweeklyKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${weekNumber}`;
        
        if (!biweeklyGroups.has(biweeklyKey)) {
          biweeklyGroups.set(biweeklyKey, []);
        }
        biweeklyGroups.get(biweeklyKey).push(track.rank);
      });

      groupedData = Array.from(biweeklyGroups.entries()).map(([key, ranks]) => {
        const [year, month] = key.split('-');
        return {
          label: `${month}월`,
          value: Math.round(ranks.reduce((sum: number, rank: number) => sum + rank, 0) / ranks.length),
          date: key
        };
      });

    } else if (diffInDays <= 365) {
      // 1년 이하: 월별 평균
      const monthlyGroups = new Map();
      kstTracks.forEach(track => {
        const date = track.kstDate;
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyGroups.has(monthKey)) {
          monthlyGroups.set(monthKey, []);
        }
        monthlyGroups.get(monthKey).push(track.rank);
      });

      groupedData = Array.from(monthlyGroups.entries()).map(([date, ranks]) => {
        const [year, month] = date.split('-');
        return {
          label: `${year}.${month}`,
          value: Math.round(ranks.reduce((sum: number, rank: number) => sum + rank, 0) / ranks.length),
          date
        };
      });

    } else {
      // 2년: 분기별 평균
      const quarterlyGroups = new Map();
      kstTracks.forEach(track => {
        const date = track.kstDate;
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        const quarterKey = `${date.getFullYear()}-Q${quarter}`;
        
        if (!quarterlyGroups.has(quarterKey)) {
          quarterlyGroups.set(quarterKey, []);
        }
        quarterlyGroups.get(quarterKey).push(track.rank);
      });

      groupedData = Array.from(quarterlyGroups.entries()).map(([date, ranks]) => ({
        label: date,
        value: Math.round(ranks.reduce((sum: number, rank: number) => sum + rank, 0) / ranks.length),
        date
      }));
    }

    return groupedData.sort((a, b) => a.date.localeCompare(b.date));
  };

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

          // 기간별 적응형 그룹화 적용
          const groupedData = getAdaptiveGroupedData(tracks, dateRange.from, dateRange.to);
          
          if (groupedData.length === 0) {
            setChart(null);
            return;
          }

          const labels = groupedData.map(item => item.label);
          const data = groupedData.map(item => item.value);

          const datasets = [{
            label: `순위 변화`,
            data: data,
            borderColor: '#3B82F6', // 파란색 선 (요청사항)
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4, // 부드러운 곡선
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2,
            pointBackgroundColor: '#3B82F6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
          }];

          const newChart = new Chart(ctx, {
            type: "line",
            data: {
              labels,
              datasets
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                intersect: false,
                mode: 'index',
              },
              scales: {
                y: {
                  reverse: true, // 낮은 순위가 위쪽에 표시
                  beginAtZero: false,
                  grid: {
                    color: 'rgba(229, 231, 235, 0.3)',
                    lineWidth: 1
                  },
                  ticks: {
                    display: true,
                    color: '#9CA3AF',
                    font: {
                      size: 11
                    },
                    callback: function(value: any) {
                      return value + '위';
                    }
                  },
                  title: {
                    display: false
                  }
                },
                x: {
                  grid: {
                    display: false
                  },
                  ticks: {
                    color: '#9CA3AF',
                    font: {
                      size: 11
                    },
                    maxRotation: 0
                  },
                  title: {
                    display: false
                  }
                }
              },
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  enabled: true,
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  titleColor: '#374151',
                  bodyColor: '#374151',
                  borderColor: '#E5E7EB',
                  borderWidth: 1,
                  cornerRadius: 8,
                  displayColors: false,
                  callbacks: {
                    title: function(context: any) {
                      return context[0].label;
                    },
                    label: function(context: any) {
                      return `순위: ${context.parsed.y}위`;
                    }
                  }
                }
              },
              elements: {
                point: {
                  hoverBorderWidth: 2
                }
              }
            }
          });
          
          setChart(newChart);
        }
      } else {
        setChart(null);
      }
    };

    initChart();

    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  }, [tracks, dateRange]);

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
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[80vw] max-w-[850px] max-h-[95vh] overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col">
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
        
        <div className="p-4 overflow-y-auto">
          {/* Date Range Picker */}
          <div className="flex flex-col space-y-2 mb-4">
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">기간:</label>
                <input 
                  type="date" 
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                  style={{
                    colorScheme: document?.documentElement?.classList?.contains('dark') ? 'dark' : 'light'
                  }}
                  value={dateRange.from}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  data-testid="input-date-from"
                />
                <span className="text-gray-500 dark:text-gray-400 text-xs">~</span>
                <input 
                  type="date" 
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                  style={{
                    colorScheme: document?.documentElement?.classList?.contains('dark') ? 'dark' : 'light'
                  }}
                  value={dateRange.to}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  data-testid="input-date-to"
                />
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
