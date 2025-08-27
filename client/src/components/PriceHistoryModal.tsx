import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface PriceHistoryModalProps {
  productId: number;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PriceHistoryModal({ productId, productName, isOpen, onClose }: PriceHistoryModalProps) {
  const [dateRange, setDateRange] = useState('1year');

  const { data: priceHistory, isLoading } = useQuery({
    queryKey: [`/products/${productId}/price-history`, dateRange],
    queryFn: async () => {
      const response = await apiRequest("GET", `/products/${productId}/price-history?range=${dateRange}`);
      return await response.json();
    },
    enabled: isOpen,
    staleTime: 1000 * 60 * 5,
  });

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MM/dd');
    } catch (error) {
      return dateString; // 파싱 실패시 원본 문자열 반환
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border rounded shadow-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400">{`날짜: ${label}`}</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {`가격: ${formatPrice(payload[0].value)}`}
          </p>
        </div>
      );
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {productName} - 가격 변동 그래프
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 기간 선택 버튼 */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: '1month', label: '1개월' },
              { key: '3months', label: '3개월' },
              { key: '6months', label: '6개월' },
              { key: '1year', label: '1년' },
              { key: '2years', label: '2년' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                className={`px-3 py-1 text-sm rounded ${
                  dateRange === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 로딩 상태 */}
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* 데이터가 없을 때 */}
          {!isLoading && (!priceHistory || !priceHistory.data || priceHistory.data.length === 0) && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400">표시할 가격 데이터가 없습니다.</p>
              </div>
            </div>
          )}

          {/* 가격 그래프 */}
          {!isLoading && priceHistory && priceHistory.data && priceHistory.data.length > 0 && (
            <>
              {/* 통계 정보 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">현재 가격</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatPrice(priceHistory.stats?.current || 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">최고가</p>
                  <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                    {formatPrice(priceHistory.stats?.highest || 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">최저가</p>
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {formatPrice(priceHistory.stats?.lowest || 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">평균가</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatPrice(priceHistory.stats?.average || 0)}
                  </p>
                </div>
              </div>

              {/* 차트 */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory.data}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      className="text-xs"
                    />
                    <YAxis 
                      tickFormatter={(value) => `₩${(value/1000).toFixed(0)}K`}
                      className="text-xs"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}