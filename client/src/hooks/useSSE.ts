import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface SSEMessage {
  type: 'connected' | 'searchStarted' | 'searchCompleted' | 'searchFailed' | 'productUpdated' | 'rankingUpdated';
  data?: any;
  message?: string;
  timestamp?: string;
}

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    try {
      // JWT 토큰 가져오기
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('🔐 SSE 연결 실패: 토큰이 없습니다');
        return;
      }

      // SSE 연결 설정
      const eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('🔗 SSE 연결됨');
        setIsConnected(true);
        setConnectionCount(prev => prev + 1);
        
        // 재연결 타이머 정리
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('✅ SSE 연결 확인:', message.message);
              break;
              
            case 'searchStarted':
              console.log('🔍 검색 시작:', message.data);
              // 검색 상태 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/search-status'] });
              break;
              
            case 'searchCompleted':
              console.log('✅ 검색 완료:', message.data);
              console.log('🔄 캐시 무효화 시작 - 제품 목록 및 일별 데이터');
              
              // 제품 목록 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/products'] });
              queryClient.invalidateQueries({ queryKey: ['/products'] });
              
              // 특정 제품의 일별 랭킹 데이터 무효화
              if (message.data?.productId) {
                queryClient.invalidateQueries({ 
                  queryKey: [`/products/${message.data.productId}/daily-ranks`] 
                });
              }
              
              // 검색 상태 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/search-status'] });
              console.log('✅ 캐시 무효화 완료');
              break;
              
            case 'searchFailed':
              console.log('❌ 검색 실패:', message.data);
              // 검색 상태 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/search-status'] });
              break;

            case 'productUpdated':
              console.log('📦 제품 업데이트:', message.data);
              // 제품 목록 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/products'] });
              break;

            case 'rankingUpdated':
              console.log('📊 랭킹 업데이트:', message.data);
              
              // 모든 제품 목록 무효화 (순위 변동 표시용)
              queryClient.invalidateQueries({ queryKey: ['/api/products'] });
              
              // 특정 제품의 일별 데이터 무효화
              if (message.data?.productId) {
                queryClient.invalidateQueries({ 
                  queryKey: [`/products/${message.data.productId}/daily-ranks`] 
                });
              }
              break;
              
            default:
              console.log('📩 SSE 메시지:', message);
              break;
          }
        } catch (error) {
          console.error('❌ SSE 메시지 파싱 오류:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.log('🔌 SSE 연결 오류 또는 종료');
        setIsConnected(false);
        
        // 자동 재연결 (10초 후)
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 SSE 재연결 시도...');
          connect();
        }, 10000);
      };

    } catch (error) {
      console.error('❌ SSE 연결 생성 실패:', error);
      setIsConnected(false);
      
      // 5초 후 재시도
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 SSE 재연결 시도...');
        connect();
      }, 5000);
    }
  };

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setIsConnected(false);
    console.log('🔌 SSE 연결 종료');
  };

  useEffect(() => {
    // 컴포넌트 마운트 시 연결
    connect();

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connectionCount,
    connect,
    disconnect
  };
}