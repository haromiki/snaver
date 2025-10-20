import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WSMessage {
  type: 'connected' | 'searchStarted' | 'searchCompleted' | 'searchFailed' | 'productUpdated' | 'rankingUpdated' | 'pong';
  data?: any;
  message?: string;
  timestamp?: string;
  clientId?: string;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getWebSocketUrl = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('🔐 WebSocket 연결 실패: 토큰이 없습니다');
      return null;
    }

    // 웹소켓 URL 설정 (JWT 토큰 포함)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;
  };

  const startPingInterval = () => {
    // 기존 ping 타이머 정리
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    // 25초마다 ping 전송 (서버의 30초 heartbeat보다 짧게)
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  };

  const stopPingInterval = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const connect = () => {
    try {
      const wsUrl = getWebSocketUrl();
      if (!wsUrl) return;

      // 기존 연결이 있으면 정리
      if (wsRef.current) {
        wsRef.current.close();
      }

      console.log('🔗 WebSocket 연결 시도...', wsUrl.replace(/token=[^&]+/, 'token=***'));
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('🔗 WebSocket 연결됨');
        setIsConnected(true);
        setConnectionCount(prev => prev + 1);
        reconnectAttemptsRef.current = 0;

        // ping 인터벌 시작
        startPingInterval();

        // 재연결 타이머 정리
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'connected':
              console.log('✅ WebSocket 연결 확인:', message.message, 'ClientID:', message.clientId);
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

            case 'pong':
              // Pong 응답 (연결 유지 확인)
              break;

            default:
              console.log('📩 WebSocket 메시지:', message);
              break;
          }
        } catch (error) {
          console.error('❌ WebSocket 메시지 파싱 오류:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.log('🔌 WebSocket 오류:', error);
        setIsConnected(false);
        stopPingInterval();
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료:', event.code, event.reason);
        setIsConnected(false);
        stopPingInterval();

        // 자동 재연결 (exponential backoff)
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          console.log(`🔄 WebSocket 재연결 시도 ${reconnectAttemptsRef.current}/${maxReconnectAttempts} (${delay}ms 후)...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.log('💥 WebSocket 최대 재연결 횟수 초과');
        }
      };

    } catch (error) {
      console.error('❌ WebSocket 연결 생성 실패:', error);
      setIsConnected(false);
      stopPingInterval();

      // 5초 후 재시도
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 WebSocket 재연결 시도...');
        connect();
      }, 5000);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    stopPingInterval();

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnected(false);
    reconnectAttemptsRef.current = 0;
    console.log('🔌 WebSocket 연결 종료');
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