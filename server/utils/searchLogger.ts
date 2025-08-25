/**
 * 상품 추적 검색 로그 시스템
 * 실서버와 리플릿 환경의 차이점 분석을 위한 상세 로깅
 */

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
    
    console.log(`${color}[SEARCH-LOG] ${logData.message}${reset}`);
    
    if (logData.data) {
      console.log(`${color}[SEARCH-DATA]${reset}`, JSON.stringify(logData.data, null, 2));
    }
    
    if (logData.error) {
      console.log(`${color}[SEARCH-ERROR]${reset}`, logData.error);
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
}

// 싱글톤 인스턴스
export const searchLogger = new SearchLogger();