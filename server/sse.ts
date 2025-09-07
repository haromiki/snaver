import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

interface SSEClient {
  id: string;
  response: Response;
  userId?: number;
}

class SSEManager {
  private clients = new Map<string, SSEClient>();

  // 클라이언트 연결 설정 (토큰 인증 포함)
  connect(req: Request, res: Response): string {
    // 쿼리 파라미터에서 토큰 가져오기 및 인증
    const token = req.query.token as string;
    let userId: number | undefined;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        userId = decoded.userId;
        console.log(`🔐 SSE 토큰 인증 성공: 사용자 ${userId}`);
      } catch (error) {
        console.log('❌ SSE 토큰 인증 실패:', error);
        res.status(401).json({ message: '유효하지 않은 토큰입니다' });
        return '';
      }
    } else {
      console.log('⚠️ SSE 연결: 토큰 없음, 익명 연결');
    }

    const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 연결 확인 메시지
    res.write('data: {"type":"connected","message":"SSE connection established"}\n\n');

    // 클라이언트 저장
    const client: SSEClient = {
      id: clientId,
      response: res,
      userId: userId // 인증된 사용자 ID (토큰에서 추출)
    };
    
    this.clients.set(clientId, client);

    // 연결 해제 처리
    req.on('close', () => {
      this.clients.delete(clientId);
      console.log(`🔌 SSE 클라이언트 연결 해제: ${clientId} (총 ${this.clients.size}개 연결)`);
    });

    req.on('error', () => {
      this.clients.delete(clientId);
      console.log(`❌ SSE 클라이언트 오류로 연결 해제: ${clientId}`);
    });

    console.log(`🔗 SSE 클라이언트 연결됨: ${clientId} (총 ${this.clients.size}개 연결)`);
    return clientId;
  }

  // 모든 클라이언트에게 브로드캐스트
  broadcast(data: any) {
    if (this.clients.size === 0) return;

    const message = `data: ${JSON.stringify(data)}\n\n`;
    const deadClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      try {
        client.response.write(message);
      } catch (error) {
        console.error(`❌ SSE 메시지 전송 실패 (${clientId}):`, error);
        deadClients.push(clientId);
      }
    });

    // 실패한 연결 정리
    deadClients.forEach(clientId => {
      this.clients.delete(clientId);
    });

    console.log(`📡 SSE 브로드캐스트: ${this.clients.size}개 클라이언트에게 전송`);
  }

  // 특정 사용자에게만 전송
  sendToUser(userId: number, data: any) {
    const userClients = Array.from(this.clients.values()).filter(
      client => client.userId === userId
    );

    if (userClients.length === 0) return;

    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    userClients.forEach(client => {
      try {
        client.response.write(message);
      } catch (error) {
        console.error(`❌ SSE 사용자별 메시지 전송 실패:`, error);
        this.clients.delete(client.id);
      }
    });

    console.log(`📡 SSE 사용자 ${userId}에게 전송: ${userClients.length}개 연결`);
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
export const sseManager = new SSEManager();

// Express 라우트 핸들러
export function handleSSEConnection(req: Request, res: Response) {
  sseManager.connect(req, res);
}

// 이벤트 타입 정의
export interface SSEEvent {
  type: 'searchStarted' | 'searchCompleted' | 'searchFailed' | 'productUpdated' | 'rankingUpdated';
  data: any;
  timestamp?: string;
}

// 편의 함수들
export function broadcastSearchStarted(productId: number, keyword: string) {
  sseManager.broadcast({
    type: 'searchStarted',
    data: { productId, keyword },
    timestamp: new Date().toISOString()
  });
}

export function broadcastSearchCompleted(productId: number, result: any) {
  sseManager.broadcast({
    type: 'searchCompleted', 
    data: { productId, result },
    timestamp: new Date().toISOString()
  });
}

export function broadcastSearchFailed(productId: number, error: string) {
  sseManager.broadcast({
    type: 'searchFailed',
    data: { productId, error },
    timestamp: new Date().toISOString()
  });
}

export function broadcastProductUpdated(productId: number) {
  sseManager.broadcast({
    type: 'productUpdated',
    data: { productId },
    timestamp: new Date().toISOString()
  });
}

export function broadcastRankingUpdated(productId: number, dailyData?: any) {
  sseManager.broadcast({
    type: 'rankingUpdated',
    data: { productId, dailyData },
    timestamp: new Date().toISOString()
  });
}