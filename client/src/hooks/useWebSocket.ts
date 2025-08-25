import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface WebSocketMessage {
  type: 'searchStarted' | 'searchCompleted' | 'searchFailed';
  data: any;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    try {
      // 웹소켓 URL 설정 (별도 경로 사용)
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('🔗 웹소켓 연결됨');
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'searchStarted':
              console.log('🔍 검색 시작:', message.data);
              // 검색 상태 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/search-status'] });
              break;
              
            case 'searchCompleted':
              console.log('✅ 검색 완료:', message.data);
              // 제품 목록과 주간 데이터 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/products'] });
              queryClient.invalidateQueries({ 
                queryKey: [`/products/${message.data.productId}/weekly-ranks`] 
              });
              queryClient.invalidateQueries({ queryKey: ['/api/search-status'] });
              break;
              
            case 'searchFailed':
              console.log('❌ 검색 실패:', message.data);
              // 검색 상태 캐시 무효화
              queryClient.invalidateQueries({ queryKey: ['/api/search-status'] });
              break;
          }
        } catch (error) {
          console.error('웹소켓 메시지 파싱 오류:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('🔌 웹소켓 연결 해제됨');
        setIsConnected(false);
        
        // 5초 후 재연결 시도
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 웹소켓 재연결 시도...');
          connect();
        }, 5000);
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ 웹소켓 오류:', error);
        setIsConnected(false);
      };

    } catch (error) {
      console.error('웹소켓 연결 실패:', error);
      setIsConnected(false);
      
      // 5초 후 재연결 시도
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { isConnected };
}