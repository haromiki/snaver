import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PriceHistoryModalProps {
  productId: number;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PriceHistoryModal({ productId, productName, isOpen, onClose }: PriceHistoryModalProps) {
  const { data: priceHistory, isLoading } = useQuery({
    queryKey: [`/products/${productId}/price-history`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/products/${productId}/price-history`);
      return await response.json();
    },
    enabled: isOpen,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  // 차트 데이터 변환
  const chartData = priceHistory?.priceHistory?.map((item: { date: string; price: number }) => ({
    date: new Date(item.date).toLocaleDateString('ko-KR', { 
      month: 'short', 
      day: 'numeric' 
    }),
    fullDate: new Date(item.date).toLocaleDateString('ko-KR'),
    price: item.price,
    formattedPrice: new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      minimumFractionDigits: 0,
    }).format(item.price)
  })) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto" data-testid="dialog-price-history">
        <DialogHeader>
          <DialogTitle data-testid="text-modal-title">
            {productName} - 3개월 가격 변동
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-[400px]" data-testid="loading-price-chart">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-gray-500 dark:text-gray-400" data-testid="text-no-price-data">
              가격 데이터가 없습니다
            </div>
          ) : (
            <div className="space-y-4">
              {/* 통계 요약 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-center" data-testid="text-current-price">
                  <div className="text-sm text-gray-500 dark:text-gray-400">현재 가격</div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {chartData[chartData.length - 1]?.formattedPrice || "-"}
                  </div>
                </div>
                <div className="text-center" data-testid="text-highest-price">
                  <div className="text-sm text-gray-500 dark:text-gray-400">최고가</div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {new Intl.NumberFormat('ko-KR', {
                      style: 'currency',
                      currency: 'KRW',
                      minimumFractionDigits: 0,
                    }).format(Math.max(...chartData.map((item: { price: number }) => item.price)))}
                  </div>
                </div>
                <div className="text-center" data-testid="text-lowest-price">
                  <div className="text-sm text-gray-500 dark:text-gray-400">최저가</div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {new Intl.NumberFormat('ko-KR', {
                      style: 'currency',
                      currency: 'KRW',
                      minimumFractionDigits: 0,
                    }).format(Math.min(...chartData.map((item: { price: number }) => item.price)))}
                  </div>
                </div>
                <div className="text-center" data-testid="text-data-points">
                  <div className="text-sm text-gray-500 dark:text-gray-400">데이터 수</div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                    {chartData.length}개
                  </div>
                </div>
              </div>

              {/* 가격 차트 */}
              <div className="h-[400px]" data-testid="chart-price-history">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="date" 
                      fontSize={12}
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis 
                      fontSize={12}
                      tick={{ fill: 'currentColor' }}
                      tickFormatter={(value) => 
                        new Intl.NumberFormat('ko-KR', {
                          notation: 'compact',
                          compactDisplay: 'short'
                        }).format(value) + '원'
                      }
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                              <p className="text-sm text-gray-600 dark:text-gray-400">{data.fullDate}</p>
                              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {data.formattedPrice}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="rgb(59, 130, 246)" 
                      strokeWidth={2}
                      dot={{ fill: 'rgb(59, 130, 246)', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: 'rgb(59, 130, 246)', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}