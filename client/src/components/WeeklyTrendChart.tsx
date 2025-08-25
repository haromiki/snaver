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

    // 데이터 준비 - 각 날짜별로 개별 dataset 생성 (24:00마다 새로운 선)
    const labels = dailyRanks.map(item => item.day);
    
    // 색상 팔레트 (7가지 다른 색상)
    const colors = [
      { line: '#3B82F6', fill: 'rgba(59, 130, 246, 0.1)' }, // 파란색 (월)
      { line: '#10B981', fill: 'rgba(16, 185, 129, 0.1)' }, // 녹색 (화)
      { line: '#F59E0B', fill: 'rgba(245, 158, 11, 0.1)' }, // 노란색 (수)
      { line: '#EF4444', fill: 'rgba(239, 68, 68, 0.1)' },  // 빨간색 (목)
      { line: '#8B5CF6', fill: 'rgba(139, 92, 246, 0.1)' }, // 보라색 (금)
      { line: '#06B6D4', fill: 'rgba(6, 182, 212, 0.1)' },  // 청록색 (토)
      { line: '#F97316', fill: 'rgba(249, 115, 22, 0.1)' }  // 주황색 (일)
    ];

    // 연속된 데이터 구간별로 dataset 생성 (24:00마다 새로운 선)
    const datasets = [];
    let currentSegment = [];
    let segmentStartIndex = 0;

    for (let i = 0; i < dailyRanks.length; i++) {
      const dayRank = dailyRanks[i];
      
      if (dayRank.hasData && dayRank.rank !== null) {
        // 데이터가 있는 경우 현재 구간에 추가
        if (currentSegment.length === 0) {
          segmentStartIndex = i;
        }
        currentSegment.push({ index: i, rank: dayRank.rank, day: dayRank.day });
      } else {
        // 데이터가 없는 경우 현재 구간 종료
        if (currentSegment.length > 0) {
          const color = colors[segmentStartIndex % colors.length];
          const segmentData = new Array(dailyRanks.length).fill(null);
          currentSegment.forEach(point => {
            segmentData[point.index] = point.rank;
          });

          datasets.push({
            label: `${currentSegment[0].day}${currentSegment.length > 1 ? '~' + currentSegment[currentSegment.length - 1].day : ''}`,
            data: segmentData,
            borderColor: color.line,
            backgroundColor: color.fill,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 4,
            pointBackgroundColor: color.line,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1,
            fill: false,
            tension: 0.3, // 부드러운 곡선
            spanGaps: false,
          });
          
          currentSegment = [];
        }
      }
    }

    // 마지막 구간 처리
    if (currentSegment.length > 0) {
      const color = colors[segmentStartIndex % colors.length];
      const segmentData = new Array(dailyRanks.length).fill(null);
      currentSegment.forEach(point => {
        segmentData[point.index] = point.rank;
      });

      datasets.push({
        label: `${currentSegment[0].day}${currentSegment.length > 1 ? '~' + currentSegment[currentSegment.length - 1].day : ''}`,
        data: segmentData,
        borderColor: color.line,
        backgroundColor: color.fill,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 4,
        pointBackgroundColor: color.line,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1,
        fill: false,
        tension: 0.3, // 부드러운 곡선
        spanGaps: false,
      });
    }

    // 차트 생성
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets,
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