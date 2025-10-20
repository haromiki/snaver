import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { parse } from 'url';

interface WSClient {
  id: string;
  ws: WebSocket;
  userId?: number;
  isAlive: boolean;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WSClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // WebSocket 서버 초기화
  initialize(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/api/ws' // 별도 경로 사용하여 Vite HMR과 충돌 방지
    });

    console.log('🔌 WebSocket 서버 초기화 완료 (경로: /api/ws)');

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // 30초마다 heartbeat 체크
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeat();
    }, 30000);

    this.wss.on('close', () => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
    });
  }

  // 클라이언트 연결 처리
  private handleConnection(ws: WebSocket, req: any) {
    const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 쿼리 파라미터에서 토큰 추출 및 인증
    let userId: number | undefined;
    try {
      const { query } = parse(req.url || '', true);
      const token = query.token as string;

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        userId = decoded.userId;
        console.log(`🔐 WebSocket 토큰 인증 성공: 사용자 ${userId}`);
      } else {
        console.log('⚠️ WebSocket 연결: 토큰 없음, 익명 연결');
      }
    } catch (error) {
      console.log('❌ WebSocket 토큰 인증 실패:', error);
      ws.close(1008, '유효하지 않은 토큰입니다');
      return;
    }

    // 클라이언트 저장
    const client: WSClient = {
      id: clientId,
      ws: ws,
      userId: userId,
      isAlive: true
    };

    this.clients.set(clientId, client);
    console.log(`🔗 WebSocket 클라이언트 연결됨: ${clientId} (총 ${this.clients.size}개 연결)`);

    // 연결 확인 메시지
    this.sendToClient(ws, {
      type: 'connected',
      message: 'WebSocket connection established',
      clientId: clientId
    });

    // Pong 응답 처리
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.isAlive = true;
      }
    });

    // 메시지 수신
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📩 WebSocket 메시지 수신:', message);

        // Ping 메시지에 대한 응답
        if (message.type === 'ping') {
          this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        }
      } catch (error) {
        console.error('❌ WebSocket 메시지 파싱 오류:', error);
      }
    });

    // 연결 해제 처리
    ws.on('close', () => {
      this.clients.delete(clientId);
      console.log(`🔌 WebSocket 클라이언트 연결 해제: ${clientId} (총 ${this.clients.size}개 연결)`);
    });

    ws.on('error', (error) => {
      console.log(`❌ WebSocket 클라이언트 오류: ${clientId}`, error);
      this.clients.delete(clientId);
    });
  }

  // Heartbeat 체크 (죽은 연결 정리)
  private checkHeartbeat() {
    const deadClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      if (!client.isAlive) {
        client.ws.terminate();
        deadClients.push(clientId);
        return;
      }

      client.isAlive = false;
      client.ws.ping();
    });

    deadClients.forEach(clientId => {
      this.clients.delete(clientId);
    });

    if (deadClients.length > 0) {
      console.log(`🧹 WebSocket 죽은 연결 정리: ${deadClients.length}개 (남은 연결: ${this.clients.size}개)`);
    }
  }

  // 단일 클라이언트에게 메시지 전송
  private sendToClient(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // 모든 클라이언트에게 브로드캐스트
  broadcast(data: any) {
    if (this.clients.size === 0) return;

    const message = JSON.stringify(data);
    const deadClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          console.error(`❌ WebSocket 메시지 전송 실패 (${clientId}):`, error);
          deadClients.push(clientId);
        }
      } else {
        deadClients.push(clientId);
      }
    });

    // 실패한 연결 정리
    deadClients.forEach(clientId => {
      this.clients.delete(clientId);
    });

    console.log(`📡 WebSocket 이벤트 전송: ${this.clients.size}개 클라이언트 (타입: ${data.type})`);
  }

  // 특정 사용자에게만 전송
  sendToUser(userId: number, data: any) {
    const userClients = Array.from(this.clients.values()).filter(
      client => client.userId === userId
    );

    if (userClients.length === 0) return;

    const message = JSON.stringify(data);

    userClients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          console.error(`❌ WebSocket 사용자별 메시지 전송 실패:`, error);
          this.clients.delete(client.id);
        }
      }
    });

    console.log(`📡 WebSocket 사용자 ${userId}에게 전송: ${userClients.length}개 연결`);
  }

  // 현재 연결 수
  getConnectionCount(): number {
    return this.clients.size;
  }

  // 연결된 사용자 수
  getUserCount(): number {
    const uniqueUsers = new Set(
      Array.from(this.clients.values())
        .map(client => client.userId)
        .filter(userId => userId !== undefined)
    );
    return uniqueUsers.size;
  }
}

// 싱글톤 인스턴스
export const wsManager = new WebSocketManager();

// 이벤트 타입 정의
export interface WSEvent {
  type: 'searchStarted' | 'searchCompleted' | 'searchFailed' | 'productUpdated' | 'rankingUpdated';
  data: any;
  timestamp?: string;
}

// 편의 함수들 (SSE와 동일한 인터페이스)
export function broadcastSearchStarted(productId: number, keyword: string) {
  wsManager.broadcast({
    type: 'searchStarted',
    data: { productId, keyword },
    timestamp: new Date().toISOString()
  });
}

export function broadcastSearchCompleted(productId: number, result: any) {
  wsManager.broadcast({
    type: 'searchCompleted',
    data: { productId, result },
    timestamp: new Date().toISOString()
  });
}

export function broadcastSearchFailed(productId: number, error: string) {
  wsManager.broadcast({
    type: 'searchFailed',
    data: { productId, error },
    timestamp: new Date().toISOString()
  });
}

export function broadcastProductUpdated(productId: number) {
  wsManager.broadcast({
    type: 'productUpdated',
    data: { productId },
    timestamp: new Date().toISOString()
  });
}

export function broadcastRankingUpdated(productId: number, dailyData?: any) {
  wsManager.broadcast({
    type: 'rankingUpdated',
    data: { productId, dailyData },
    timestamp: new Date().toISOString()
  });
}

// 하위 호환성을 위한 레거시 함수 (기존 코드가 사용할 수 있도록)
export function setupWebSocket(server: Server) {
  wsManager.initialize(server);
}

export function broadcastToClients(data: any) {
  wsManager.broadcast(data);
}