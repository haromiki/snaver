import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface HourlyRank {
  hour: string;
  time: string;
  rank: number | null;
  hasData: boolean;
}

interface DailyRankResponse {
  productId: number;
  dayStart: string;
  hourlyRanks: HourlyRank[];
}

interface DailyTrendMiniChartProps {
  productId: number;
  className?: string;
}

export default function DailyTrendMiniChart({ productId, className = "" }: DailyTrendMiniChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1일 순위 데이터 조회 (5초마다 폴링)
  const { data: dailyData, isLoading } = useQuery<DailyRankResponse>({
    queryKey: [`/products/${productId}/daily-ranks`],
    refetchInterval: 5 * 1000, // 5초마다 폴링
    refetchIntervalInBackground: true,
    staleTime: 0 // 항상 최신 데이터 요청
  });

  useEffect(() => {
    if (!canvasRef.current || !dailyData?.hourlyRanks || dailyData.hourlyRanks.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 설정
    const width = canvas.width;
    const height = canvas.height;

    // 캔버스 초기화
    ctx.clearRect(0, 0, width, height);

    // 실제 데이터가 있는 순위들만 필터링
    const validRanks = dailyData.hourlyRanks.filter(item => item.hasData && item.rank !== null);
    
    if (validRanks.length < 2) {
      // 데이터가 부족한 경우 빈 차트 표시
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', width / 2, height / 2);
      return;
    }

    // 순위 범위 계산
    const ranks = validRanks.map(item => item.rank!);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const rankRange = maxRank - minRank || 1;

    // 좌표 변환 함수
    const getX = (hourIndex: number) => (hourIndex * (width - 4) / 23) + 2;
    const getY = (rank: number) => {
      // 순위가 좋을수록(숫자 작을수록) 위쪽에 표시
      const normalized = (rank - minRank) / rankRange;
      return 4 + (normalized * (height - 8));
    };

    // 라인과 색상 세그먼트 생성
    const points: Array<{x: number, y: number, rank: number, hourIndex: number}> = [];
    
    // 각 시간대에 대해 데이터 매핑
    for (let hour = 0; hour < 24; hour++) {
      const hourData = dailyData.hourlyRanks[hour];
      if (hourData.hasData && hourData.rank !== null) {
        points.push({
          x: getX(hour),
          y: getY(hourData.rank),
          rank: hourData.rank,
          hourIndex: hour
        });
      }
    }

    // 각진 라인 그리기
    if (points.length >= 2) {
      // 이전 트렌드 색상 추적 변수
      let previousColor = '#3b82f6'; // 기본값
      
      for (let i = 0; i < points.length - 1; i++) {
        const currentPoint = points[i];
        const nextPoint = points[i + 1];
        
        // 순위 변화에 따른 색상 결정
        let color;
        if (currentPoint.rank > nextPoint.rank) {
          color = '#3b82f6'; // 상승
          previousColor = '#3b82f6';
        } else if (currentPoint.rank < nextPoint.rank) {
          color = '#ef4444'; // 하락  
          previousColor = '#ef4444';
        } else {
          color = previousColor; // 동일하면 이전 색상 유지
        }
        
        // 라인 그리기
        ctx.beginPath();
        ctx.moveTo(currentPoint.x, currentPoint.y);
        ctx.lineTo(nextPoint.x, nextPoint.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // 그라데이션 채우기 (각 세그먼트별로)
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        if (color === '#3b82f6') {
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)'); // 위쪽 진함
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)'); // 아래쪽 연함
        } else {
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)'); // 위쪽 진함
          gradient.addColorStop(1, 'rgba(239, 68, 68, 0.1)'); // 아래쪽 연함
        }
        
        // 세그먼트 채우기
        ctx.beginPath();
        ctx.moveTo(currentPoint.x, height);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.lineTo(nextPoint.x, nextPoint.y);
        ctx.lineTo(nextPoint.x, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }

  }, [dailyData, productId]);

  // 로딩 상태
  if (isLoading) {
    return (
      <div className={`w-[108px] h-[62px] flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded animate-pulse ${className}`}>
        <div className="w-2 h-2 bg-gray-300 dark:bg-gray-500 rounded-full"></div>
      </div>
    );
  }

  // 데이터가 없는 경우
  if (!dailyData?.hourlyRanks || dailyData.hourlyRanks.length === 0) {
    return (
      <div className={`w-[108px] h-[62px] flex items-center justify-center bg-transparent rounded ${className}`}>
        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
      </div>
    );
  }

  return (
    <div className={`w-[108px] h-[62px] ${className}`}>
      <canvas
        ref={canvasRef}
        width={216}   // 108px × 2 (Retina/고해상도 보정)
        height={124}  // 62px × 2
        className="w-full h-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
      />
    </div>
  );
}