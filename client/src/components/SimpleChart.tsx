interface SimpleChartProps {
  productId: number;
  hourlyRanks: Array<{
    hour: string;
    time: string;
    rank: number | null;
    hasData: boolean;
  }>;
}

export default function SimpleChart({ productId, hourlyRanks }: SimpleChartProps) {
  const validData = hourlyRanks.filter(item => item.hasData && item.rank !== null);
  
  if (validData.length === 0) {
    return (
      <div className="w-20 h-16 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded border">
        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
      </div>
    );
  }

  // 실제 순위 데이터가 있는 경우 간단한 바 차트
  const ranks = validData.map(item => item.rank!);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const avgRank = Math.round(ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length);
  
  // 순위 변화 계산 (낮을수록 좋음)
  const firstRank = ranks[0];
  const lastRank = ranks[ranks.length - 1];
  const trendColor = firstRank > lastRank ? 'text-blue-600' : firstRank < lastRank ? 'text-red-500' : 'text-gray-600';
  const trendIcon = firstRank > lastRank ? '↗' : firstRank < lastRank ? '↘' : '→';
  
  return (
    <div className="w-20 h-16 bg-white dark:bg-gray-800 border rounded p-1 flex flex-col justify-between">
      <div className="flex items-center justify-between text-xs">
        <span className={`${trendColor} font-bold`}>{trendIcon}</span>
        <span className="text-gray-500 dark:text-gray-400">{validData.length}개</span>
      </div>
      
      {/* 간단한 바 */}
      <div className="flex items-end justify-center space-x-1 h-8">
        {validData.slice(-4).map((item, idx) => {
          const height = Math.max(8, 32 - ((item.rank! / 200) * 24));
          return (
            <div
              key={idx}
              className="w-1 bg-blue-400 dark:bg-blue-500 rounded-sm"
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>
      
      <div className="text-xs text-center text-gray-600 dark:text-gray-300">
        {avgRank}위
      </div>
    </div>
  );
}