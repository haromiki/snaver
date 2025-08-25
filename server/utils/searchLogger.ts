/**
 * 상품 추적 검색 로그 시스템
 * 실서버와 리플릿 환경의 차이점 분석을 위한 상세 로깅
 * 실서버: /srv/xpro0/.pm2/logs/snaver-app.log 파일에 로깅
 * 리플릿: 콘솔 출력
 */

import fs from 'fs';
import path from 'path';

export interface SearchLogData {
  searchId: string;
  timestamp: string;
  environment: 'replit' | 'production' | 'unknown';
  productId: string;
  keyword: string;
  step: string;
  status: 'start' | 'progress' | 'success' | 'error' | 'end';
  message: string;
  data?: any;
  duration?: number;
  error?: string;
}

class SearchLogger {
  private logs: SearchLogData[] = [];
  private activeSearches = new Map<string, { startTime: number; productId: string; keyword: string }>();
  private logFilePath: string;
  private isProduction: boolean;

  constructor() {
    // 강화된 환경 감지
    const detectedEnv = this.detectEnvironment();
    this.isProduction = detectedEnv === 'production';
    
    // 실서버 로그 강제 활성화 (NODE_ENV=production일 때도)
    const forceServerLogging = process.env.NODE_ENV === 'production' || 
                              process.cwd().includes('/srv/') || 
                              process.env.HOSTNAME?.includes('xpro');
    
    this.logFilePath = forceServerLogging
      ? '/srv/xpro0/.pm2/logs/snaver-app.log'
      : path.join(process.cwd(), 'logs', 'snaver-app.log');
    
    // 로그 디렉토리 생성
    this.ensureLogDirectory();
    
    // 환경 정보 로깅 (디버깅용)
    console.log(`🔧 SearchLogger 초기화:`);
    console.log(`   환경: ${detectedEnv}`);
    console.log(`   로그파일: ${this.logFilePath}`);
    console.log(`   실서버모드: ${forceServerLogging}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   HOSTNAME: ${process.env.HOSTNAME}`);
    console.log(`   CWD: ${process.cwd()}`);
  }

  /**
   * 환경 감지
   */
  private detectEnvironment(): 'replit' | 'production' | 'unknown' {
    const hostname = process.env.HOSTNAME || '';
    const pwd = process.cwd();
    
    if (hostname.includes('replit') || pwd.includes('runner')) {
      return 'replit';
    } else if (hostname.includes('xpro') || pwd.includes('srv')) {
      return 'production';
    }
    return 'unknown';
  }

  /**
   * 로그 디렉토리 생성 (강화된 버전)
   */
  private ensureLogDirectory() {
    try {
      const logDir = path.dirname(this.logFilePath);
      console.log(`🔍 로그 디렉토리 확인: ${logDir}`);
      
      if (!fs.existsSync(logDir)) {
        console.log(`📁 로그 디렉토리가 없음. 생성 시도: ${logDir}`);
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`✅ 로그 디렉토리 생성 성공: ${logDir}`);
      } else {
        console.log(`✅ 로그 디렉토리 이미 존재: ${logDir}`);
      }
      
      // 권한 확인
      try {
        fs.accessSync(logDir, fs.constants.W_OK);
        console.log(`✅ 로그 디렉토리 쓰기 권한 있음: ${logDir}`);
      } catch (permError) {
        console.error(`❌ 로그 디렉토리 쓰기 권한 없음: ${logDir}`, permError);
        
        // 대안 디렉토리 생성 시도 (/tmp)
        const fallbackDir = '/tmp';
        console.log(`📁 대안 디렉토리 사용: ${fallbackDir}`);
        this.logFilePath = path.join(fallbackDir, 'snaver-app.log');
      }
    } catch (error) {
      console.error('❌ 로그 디렉토리 생성 실패:', error);
      
      // 최후의 수단: /tmp 사용
      console.log(`📁 최후 수단: /tmp 디렉토리 사용`);
      this.logFilePath = '/tmp/snaver-app.log';
    }
  }

  /**
   * 파일에 로그 쓰기 (강화된 버전)
   */
  private writeToFile(logLine: string) {
    // 실서버 환경 감지 강화 (여러 조건으로 확인)
    const shouldWriteFile = this.isProduction || 
                           process.env.NODE_ENV === 'production' ||
                           process.cwd().includes('/srv/') ||
                           process.env.HOSTNAME?.includes('xpro') ||
                           this.logFilePath.includes('/srv/');
    
    if (!shouldWriteFile) {
      console.log(`📝 파일 로깅 건너뜀 (리플릿 환경)`);
      return;
    }
    
    try {
      const timestamp = new Date().toISOString();
      const formattedLog = `[${timestamp}] ${logLine}\n`;
      
      // 파일 쓰기 시도
      fs.appendFileSync(this.logFilePath, formattedLog, 'utf8');
      console.log(`✅ 로그 파일 쓰기 성공: ${this.logFilePath}`);
    } catch (error) {
      console.error(`❌ 로그 파일 쓰기 실패 (${this.logFilePath}):`, error);
      
      // 권한 문제 시 대안 경로 시도
      try {
        const fallbackPath = '/tmp/snaver-app.log';
        const timestamp = new Date().toISOString();
        const formattedLog = `[${timestamp}] ${logLine}\n`;
        fs.appendFileSync(fallbackPath, formattedLog, 'utf8');
        console.log(`✅ 대안 로그 파일 쓰기 성공: ${fallbackPath}`);
      } catch (fallbackError) {
        console.error(`❌ 대안 로그 파일도 실패:`, fallbackError);
      }
    }
  }

  /**
   * 검색 시작 로그
   */
  startSearch(productId: string, keyword: string): string {
    const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    const environment = this.detectEnvironment();
    
    this.activeSearches.set(searchId, {
      startTime: Date.now(),
      productId,
      keyword
    });

    const logData: SearchLogData = {
      searchId,
      timestamp,
      environment,
      productId,
      keyword,
      step: '검색_시작',
      status: 'start',
      message: `[${environment.toUpperCase()}] 검색 시작 - 제품ID: ${productId}, 키워드: "${keyword}"`,
      data: {
        hostname: process.env.HOSTNAME || 'unknown',
        cwd: process.cwd(),
        nodeEnv: process.env.NODE_ENV || 'unknown',
        hasNaverKeys: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET)
      }
    };

    this.addLog(logData);
    return searchId;
  }

  /**
   * 진행 상황 로그
   */
  logProgress(searchId: string, step: string, message: string, data?: any) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;

    const logData: SearchLogData = {
      searchId,
      timestamp: new Date().toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step,
      status: 'progress',
      message,
      data,
      duration: Date.now() - search.startTime
    };

    this.addLog(logData);
  }

  /**
   * 성공 로그
   */
  logSuccess(searchId: string, step: string, message: string, data?: any) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;

    const logData: SearchLogData = {
      searchId,
      timestamp: new Date().toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step,
      status: 'success',
      message,
      data,
      duration: Date.now() - search.startTime
    };

    this.addLog(logData);
  }

  /**
   * 오류 로그
   */
  logError(searchId: string, step: string, message: string, error?: any) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;

    const logData: SearchLogData = {
      searchId,
      timestamp: new Date().toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step,
      status: 'error',
      message,
      error: error?.message || String(error),
      duration: Date.now() - search.startTime
    };

    this.addLog(logData);
  }

  /**
   * 검색 종료 로그
   */
  endSearch(searchId: string, found: boolean, finalRank?: number, notes?: string[]) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;

    const duration = Date.now() - search.startTime;
    
    const logData: SearchLogData = {
      searchId,
      timestamp: new Date().toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step: '검색_완료',
      status: 'end',
      message: `[${this.detectEnvironment().toUpperCase()}] 검색 완료 - ${found ? `${finalRank}위 발견` : '미발견'} (${duration}ms)`,
      data: {
        found,
        finalRank,
        notes,
        totalDuration: duration
      },
      duration
    };

    this.addLog(logData);
    this.activeSearches.delete(searchId);
  }

  /**
   * 로그 추가 및 출력
   */
  private addLog(logData: SearchLogData) {
    this.logs.push(logData);
    
    // 콘솔 출력 (컬러 코딩)
    const colorMap = {
      start: '\x1b[32m',    // 초록
      progress: '\x1b[36m', // 청록
      success: '\x1b[33m',  // 노랑
      error: '\x1b[31m',    // 빨강
      end: '\x1b[35m'       // 자주
    };
    
    const color = colorMap[logData.status] || '\x1b[0m';
    const reset = '\x1b[0m';
    
    // 콘솔 출력
    console.log(`${color}[SEARCH-LOG] ${logData.message}${reset}`);
    
    // 파일 로그 (실서버만)
    this.writeToFile(`[SEARCH-LOG] ${logData.message}`);
    
    if (logData.data) {
      console.log(`${color}[SEARCH-DATA]${reset}`, JSON.stringify(logData.data, null, 2));
      this.writeToFile(`[SEARCH-DATA] ${JSON.stringify(logData.data)}`);
    }
    
    if (logData.error) {
      console.log(`${color}[SEARCH-ERROR]${reset}`, logData.error);
      this.writeToFile(`[SEARCH-ERROR] ${logData.error}`);
    }

    // 로그 개수 제한 (메모리 관리)
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500); // 최근 500개만 유지
    }
  }

  /**
   * 특정 검색의 전체 로그 조회
   */
  getSearchLogs(searchId: string): SearchLogData[] {
    return this.logs.filter(log => log.searchId === searchId);
  }

  /**
   * 최근 검색 로그들 조회
   */
  getRecentLogs(limit: number = 50): SearchLogData[] {
    return this.logs.slice(-limit);
  }

  /**
   * 환경별 성공률 통계
   */
  getStats() {
    const stats = {
      replit: { total: 0, success: 0, error: 0 },
      production: { total: 0, success: 0, error: 0 },
      unknown: { total: 0, success: 0, error: 0 }
    };

    const completedSearches = this.logs.filter(log => log.status === 'end');
    
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

  /**
   * 로그 내보내기 (실서버 디버깅용)
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * 실서버 로그 파일 읽기 (디버깅용)
   */
  readLogFile(): string {
    try {
      if (fs.existsSync(this.logFilePath)) {
        return fs.readFileSync(this.logFilePath, 'utf8');
      }
      return '로그 파일이 존재하지 않습니다.';
    } catch (error) {
      return `로그 파일 읽기 오류: ${error}`;
    }
  }

  /**
   * 로그 파일 정보
   */
  getLogFileInfo() {
    return {
      environment: this.detectEnvironment(),
      logFilePath: this.logFilePath,
      isProduction: this.isProduction,
      fileExists: fs.existsSync(this.logFilePath),
      fileSize: fs.existsSync(this.logFilePath) ? fs.statSync(this.logFilePath).size : 0
    };
  }
}

// 싱글톤 인스턴스 (ESM 방식)
const searchLoggerInstance = new SearchLogger();
export { searchLoggerInstance as searchLogger };
export default searchLoggerInstance;