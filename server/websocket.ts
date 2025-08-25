import { WebSocketServer } from "ws";
import { Server } from "http";

// 웹소켓 연결 관리
const clients = new Set<any>();
let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ 
    server,
    path: '/api/ws' // 별도 경로 사용하여 Vite HMR과 충돌 방지
  });

  wss.on('connection', (ws) => {
    console.log('👋 웹소켓 클라이언트 연결됨');
    clients.add(ws);

    ws.on('close', () => {
      console.log('👋 웹소켓 클라이언트 연결 해제됨');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('❌ 웹소켓 오류:', error);
      clients.delete(ws);
    });
  });

  console.log('✅ 웹소켓 서버 시작됨 (/api/ws)');
}

// 웹소켓 브로드캐스트 함수
export function broadcastToClients(data: any) {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify(data);
  clients.forEach((client: any) => {
    if (client.readyState === 1) { // OPEN 상태
      try {
        client.send(message);
      } catch (error) {
        console.error('❌ 웹소켓 메시지 전송 실패:', error);
        clients.delete(client);
      }
    }
  });
}