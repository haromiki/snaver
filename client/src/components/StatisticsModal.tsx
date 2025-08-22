import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

interface StatisticsModalProps {
  productId: number;
  onClose: () => void;
}

export default function StatisticsModal({ productId, onClose }: StatisticsModalProps) {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    to: new Date().toISOString().split('T')[0], // today
  });
  
  const [chart, setChart] = useState<any>(null);

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

          // Prepare data
          const chartData = tracks
            .filter((track: any) => track.globalRank) // Only show tracks with rank
            .reverse() // Show chronological order
            .map((track: any) => ({
              x: new Date(track.checkedAt).toLocaleDateString(),
              y: track.globalRank || 220, // Show 220 for not found
            }));

          const newChart = new Chart(ctx, {
            type: "line",
            data: {
              datasets: [{
                label: "순위",
                data: chartData,
                borderColor: "#1976D2",
                backgroundColor: "rgba(25, 118, 210, 0.1)",
                tension: 0.4,
                fill: true,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  reverse: true, // Lower rank numbers appear higher
                  beginAtZero: false,
                  title: {
                    display: true,
                    text: "순위 (낮을수록 상위)"
                  }
                },
                x: {
                  title: {
                    display: true,
                    text: "날짜"
                  }
                }
              },
              plugins: {
                legend: {
                  display: false
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
    // Query will automatically refetch due to dependency change
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" data-testid="statistics-modal">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">순위 통계</h3>
            <p className="text-sm text-gray-500">제품 #{productId}</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600"
            data-testid="button-close-modal"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
        
        <div className="p-6">
          {/* Date Range Picker */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">기간:</label>
              <input 
                type="date" 
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                data-testid="input-date-from"
              />
              <span className="text-gray-500">~</span>
              <input 
                type="date" 
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                data-testid="input-date-to"
              />
            </div>
            <button 
              onClick={handleDateUpdate}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-blue-700"
              data-testid="button-update-chart"
            >
              조회
            </button>
          </div>

          {/* Chart */}
          <div className="bg-gray-50 rounded-lg p-4">
            <canvas id="rank-chart" width="800" height="400"></canvas>
          </div>

          {/* Statistics Summary */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-success" data-testid="stat-best-rank">
                {stats.best || "-"}
              </div>
              <div className="text-sm text-gray-600">최고 순위</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-error" data-testid="stat-worst-rank">
                {stats.worst || "-"}
              </div>
              <div className="text-sm text-gray-600">최저 순위</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900" data-testid="stat-average-rank">
                {stats.average}
              </div>
              <div className="text-sm text-gray-600">평균 순위</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary" data-testid="stat-found-rate">
                {stats.foundRate}%
              </div>
              <div className="text-sm text-gray-600">발견율</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
