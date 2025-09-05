import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

// Chart.js 등록
Chart.register(...registerables);

interface HourlyRank {
  hour: string;
  time: string;
  rank: number | null;
  hasData: boolean;
}

interface DailyTrendChartProps {
  productId: number;
  hourlyRanks: HourlyRank[];
  className?: string;
}

export default function DailyTrendChart({ productId, hourlyRanks, className = "" }: DailyTrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // 데이터 유효성 체크를 먼저 수행
  const validData = hourlyRanks?.filter(item => item.rank !== null && item.hasData) || [];
  
  console.log(`🔹 [Chart Debug ${productId}] hourlyRanks 개수:`, hourlyRanks?.length);
  console.log(`🔹 [Chart Debug ${productId}] 유효 데이터 개수:`, validData.length);
  console.log(`🔹 [Chart Debug ${productId}] 유효 데이터 샘플:`, validData.slice(0, 2));
  
  // 제품 23만 상세 로그
  if (productId === 23) {
    console.log(`🎯 [Chart 23 상세] 전체 hourlyRanks:`, hourlyRanks);
    console.log(`🎯 [Chart 23 상세] validData:`, validData);
  }


  useEffect(() => {
    if (!canvasRef.current || !hourlyRanks || hourlyRanks.length === 0) return;

    // 기존 차트 제거
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // 데이터 준비 - 24시간 레이블과 랭크 데이터
    const labels = hourlyRanks.map(item => item.hour);
    const rankData = hourlyRanks.map(item => item.rank);
    
    console.log(`[Chart Render ${productId}] labels:`, labels.slice(0, 3));
    console.log(`[Chart Render ${productId}] rankData:`, rankData.slice(0, 10));
    
    // 유효한 데이터가 하나도 없으면 기본 차트 생성
    const hasValidData = rankData.some(rank => rank !== null);
    console.log(`[Chart Render ${productId}] hasValidData:`, hasValidData);
    
    // 하루 평균 변화 계산 (첫 번째와 마지막 데이터 비교)
    const validRanks = hourlyRanks.filter(item => item.rank !== null);
    let trendColor = '#000000'; // 기본 검은색
    
    if (validRanks.length >= 2) {
      const firstRank = validRanks[0].rank!;
      const lastRank = validRanks[validRanks.length - 1].rank!;
      const rankDiff = firstRank - lastRank; // 첫 번째 - 마지막 (순위는 낮을수록 좋음)
      
      if (rankDiff > 0) {
        // 순위 상승 (숫자가 작아짐) - 파란색
        trendColor = '#3B82F6';
      } else if (rankDiff < 0) {
        // 순위 하락 (숫자가 커짐) - 빨간색
        trendColor = '#EF4444';
      }
    }


    // 차트 생성 - 면적 그래프 스타일
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '순위',
          data: rankData,
          borderColor: trendColor,
          backgroundColor: trendColor + '40', // 투명도 25%
          borderWidth: 2,
          pointRadius: 0, // 점 제거
          pointHoverRadius: 0,
          fill: true, // 면적 채우기
          tension: 0, // 각진 그래프
          spanGaps: true, // 빈 데이터 포인트를 연결하여 그래프 표시
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'nearest',
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
            hoverBorderWidth: 0
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
  }, [hourlyRanks, productId]);

  // 데이터가 없는 경우 - hourlyRanks 배열만 체크 (validData가 0개여도 그래프 표시)
  if (!hourlyRanks || hourlyRanks.length === 0) {
    return (
      <div className={`w-20 h-16 flex items-center justify-center bg-gray-100 rounded ${className}`}>
        <span className="text-xs text-gray-400">-</span>
      </div>
    );
  }

  return (
    <div className={`w-20 h-16 relative ${className}`}>
      <canvas 
        ref={canvasRef}
        className="w-full h-full"
        data-testid={`chart-daily-trend-${productId}`}
      />
    </div>
  );
}