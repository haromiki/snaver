import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

// Chart.js 등록
Chart.register(...registerables);

interface DailyRank {
  day: string;
  date: string;
  rank: number | null;
  hasData: boolean;
}

interface WeeklyTrendChartProps {
  productId: number;
  dailyRanks: DailyRank[];
  className?: string;
}

export default function WeeklyTrendChart({ productId, dailyRanks, className = "" }: WeeklyTrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !dailyRanks || dailyRanks.length === 0) return;

    // 기존 차트 제거
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // 데이터 준비 - null 값을 제외하고 실제 순위 데이터만 사용
    const labels = dailyRanks.map(item => item.day);
    const data = dailyRanks.map(item => item.rank);
    
    // 색상 결정 (평균 순위에 따라)
    const validRanks = data.filter(rank => rank !== null) as number[];
    const avgRank = validRanks.length > 0 ? validRanks.reduce((sum, rank) => sum + rank, 0) / validRanks.length : 50;
    
    let lineColor = '#6B7280'; // 기본 회색
    let fillColor = 'rgba(107, 114, 128, 0.1)';
    
    if (avgRank <= 10) {
      lineColor = '#059669'; // 성공 (녹색)
      fillColor = 'rgba(5, 150, 105, 0.1)';
    } else if (avgRank <= 30) {
      lineColor = '#D97706'; // 경고 (주황색)
      fillColor = 'rgba(217, 119, 6, 0.1)';
    } else if (avgRank > 30) {
      lineColor = '#DC2626'; // 오류 (빨간색)
      fillColor = 'rgba(220, 38, 38, 0.1)';
    }

    // 차트 생성
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 3,
          pointBackgroundColor: lineColor,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          fill: true,
          tension: 0.3, // 부드러운 곡선
          spanGaps: true, // null 값 건너뛰기
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'none',
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        },
        scales: {
          x: {
            display: false, // x축 숨김
            grid: {
              display: false
            }
          },
          y: {
            display: false, // y축 숨김
            reverse: true, // 순위는 낮을수록 좋으므로 반전
            grid: {
              display: false
            },
            suggestedMin: 1,
            suggestedMax: 200
          }
        },
        elements: {
          point: {
            hoverBorderWidth: 1
          }
        }
      }
    });

    // cleanup function
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [dailyRanks, productId]);

  // 데이터가 없는 경우
  if (!dailyRanks || dailyRanks.length === 0) {
    return (
      <div className={`w-20 h-8 flex items-center justify-center bg-gray-100 rounded ${className}`}>
        <span className="text-xs text-gray-400">-</span>
      </div>
    );
  }

  return (
    <div className={`w-20 h-8 relative ${className}`}>
      <canvas 
        ref={canvasRef}
        className="w-full h-full"
        data-testid={`chart-weekly-trend-${productId}`}
      />
    </div>
  );
}