import fs from 'fs';
import path from 'path';

// 로그 데이터 타입 정의
export interface SearchLogData {
  searchId: string;
  timestamp: string;
  environment: 'replit' | 'production' | 'unknown';
  step: 'start' | 'config' | 'api_request' | 'api_response' | 'matching' | 'result' | 'end' | 'error';
  message: string;
  data?: any;
  error?: string;
  status?: 'running' | 'end';
}

// 전역 로그 저장소
let logs: SearchLogData[] = [];
let logFilePath = '';
let isProduction = false;

// 환경 감지 함수
function detectEnvironment(): 'replit' | 'production' | 'unknown' {
  if (process.env.NODE_ENV === 'production' && !process.env.REPLIT_DB_URL) {
    return 'production';
  }
  if (process.env.REPLIT_DB_URL || process.env.HOSTNAME?.includes('replit')) {
    return 'replit';
  }
  return 'unknown';
}

// 로그 파일 경로 설정 함수
function setupLogPath(): string {
  const env = detectEnvironment();
  const isProd = env === 'production';
  
  // 실서버 환경에서는 /srv/xpro0/.pm2/logs/ 우선 시도
  if (isProd) {
    const serverPaths = [
      '/srv/xpro0/.pm2/logs',
      '/var/log/snaver',
      '/tmp'
    ];
    
    for (const serverPath of serverPaths) {
      try {
        if (!fs.existsSync(serverPath)) {
          fs.mkdirSync(serverPath, { recursive: true });
        }
        
        // 쓰기 권한 테스트
        const testFile = path.join(serverPath, 'test-write.tmp');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        
        return path.join(serverPath, 'snaver-app.log');
      } catch (error) {
        console.log(`⚠️ 로그 경로 사용 불가: ${serverPath}`);
        continue;
      }
    }
  }
  
  // 리플릿 환경 또는 실서버 실패시 기본 경로
  const defaultPath = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return path.join(defaultPath, 'snaver-app.log');
}

// 초기화 함수
function initializeLogger(): void {
  const env = detectEnvironment();
  isProduction = env === 'production';
  logFilePath = setupLogPath();
  
  console.log('🔧 SearchLogger 초기화:');
  console.log(`   환경: ${env}`);
  console.log(`   로그파일: ${logFilePath}`);
  console.log(`   실서버모드: ${isProduction}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   HOSTNAME: ${process.env.HOSTNAME}`);
  console.log(`   CWD: ${process.cwd()}`);
}

// 파일 쓰기 함수
function writeToFile(message: string): void {
  if (!isProduction) {
    console.log('📝 파일 로깅 건너뜀 (리플릿 환경)');
    return;
  }
  
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFilePath, logLine, 'utf8');
  } catch (error) {
    console.error('❌ 로그 파일 쓰기 오류:', error);
  }
}

// 로그 추가 함수
export function addLog(logData: SearchLogData): void {
  // 메모리에 저장
  logs.push(logData);
  
  // 콘솔 출력 (색상 포함)
  const colors = {
    start: '\x1b[32m',    // 녹색
    config: '\x1b[36m',   // 청록색  
    api_request: '\x1b[33m', // 노란색
    api_response: '\x1b[34m', // 파란색
    matching: '\x1b[35m',  // 자홍색
    result: '\x1b[32m',    // 녹색
    end: '\x1b[32m',       // 녹색
    error: '\x1b[31m'      // 빨간색
  };
  
  const color = colors[logData.step] || '\x1b[0m';
  const reset = '\x1b[0m';
  
  console.log(`${color}[SEARCH-LOG]${reset} [${logData.environment.toUpperCase()}] ${logData.message}`);
  writeToFile(`[SEARCH-LOG] [${logData.environment.toUpperCase()}] ${logData.message}`);
  
  if (logData.data) {
    console.log(`${color}[SEARCH-DATA]${reset} ${JSON.stringify(logData.data)}`);
    writeToFile(`[SEARCH-DATA] ${JSON.stringify(logData.data)}`);
  }
  
  if (logData.error) {
    console.log(`${color}[SEARCH-ERROR]${reset}`, logData.error);
    writeToFile(`[SEARCH-ERROR] ${logData.error}`);
  }

  // 로그 개수 제한 (메모리 관리)
  if (logs.length > 1000) {
    logs = logs.slice(-500); // 최근 500개만 유지
  }
}

// 특정 검색의 전체 로그 조회
export function getSearchLogs(searchId: string): SearchLogData[] {
  return logs.filter(log => log.searchId === searchId);
}

// 최근 검색 로그들 조회
export function getRecentLogs(limit: number = 50): SearchLogData[] {
  return logs.slice(-limit);
}

// 환경별 성공률 통계
export function getStats() {
  const stats = {
    replit: { total: 0, success: 0, error: 0 },
    production: { total: 0, success: 0, error: 0 },
    unknown: { total: 0, success: 0, error: 0 }
  };

  const completedSearches = logs.filter(log => log.status === 'end');
  
  completedSearches.forEach(log => {
    const env = log.environment;
    stats[env].total++;
    
    if (log.data?.found) {
      stats[env].success++;
    } else {
      stats[env].error++;
    }
  });

  return stats;
}

// 로그 내보내기 (실서버 디버깅용)
export function exportLogs(): string {
  return JSON.stringify(logs, null, 2);
}

// 실서버 로그 파일 읽기 (디버깅용)
export function readLogFile(): string {
  try {
    if (fs.existsSync(logFilePath)) {
      return fs.readFileSync(logFilePath, 'utf8');
    }
    return '로그 파일이 존재하지 않습니다.';
  } catch (error) {
    return `로그 파일 읽기 오류: ${error}`;
  }
}

// 로그 파일 정보
export function getLogFileInfo() {
  return {
    environment: detectEnvironment(),
    logFilePath: logFilePath,
    isProduction: isProduction,
    fileExists: fs.existsSync(logFilePath),
    fileSize: fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0
  };
}

// SearchLogger 객체 생성 (기존 코드 호환성)
export const searchLogger = {
  addLog,
  getSearchLogs,
  getRecentLogs,
  getStats,
  exportLogs,
  readLogFile,
  getLogFileInfo,
  
  // 초기화 메서드 (클래스 호환성)
  initialize: initializeLogger
};

// 초기화 실행
initializeLogger();

// 기본 export (기존 코드 호환성)
export default searchLogger;