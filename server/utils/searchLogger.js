"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// searchLogger.ts
var searchLogger_exports = {};
__export(searchLogger_exports, {
  searchLogger: () => searchLogger
});
module.exports = __toCommonJS(searchLogger_exports);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var SearchLogger = class {
  logs = [];
  activeSearches = /* @__PURE__ */ new Map();
  logFilePath;
  isProduction;
  constructor() {
    this.isProduction = this.detectEnvironment() === "production";
    this.logFilePath = this.isProduction ? "/srv/xpro0/.pm2/logs/snaver-app.log" : import_path.default.join(process.cwd(), "logs", "snaver-app.log");
    this.ensureLogDirectory();
  }
  /**
   * 환경 감지
   */
  detectEnvironment() {
    const hostname = process.env.HOSTNAME || "";
    const pwd = process.cwd();
    if (hostname.includes("replit") || pwd.includes("runner")) {
      return "replit";
    } else if (hostname.includes("xpro") || pwd.includes("srv")) {
      return "production";
    }
    return "unknown";
  }
  /**
   * 로그 디렉토리 생성
   */
  ensureLogDirectory() {
    try {
      const logDir = import_path.default.dirname(this.logFilePath);
      if (!import_fs.default.existsSync(logDir)) {
        import_fs.default.mkdirSync(logDir, { recursive: true });
        console.log(`\u2705 \uB85C\uADF8 \uB514\uB809\uD1A0\uB9AC \uC0DD\uC131\uB428: ${logDir}`);
      }
    } catch (error) {
      console.error("\uB85C\uADF8 \uB514\uB809\uD1A0\uB9AC \uC0DD\uC131 \uC2E4\uD328:", error);
    }
  }
  /**
   * 파일에 로그 쓰기
   */
  writeToFile(logLine) {
    if (!this.isProduction) return;
    try {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const formattedLog = `[${timestamp}] ${logLine}
`;
      import_fs.default.appendFileSync(this.logFilePath, formattedLog, "utf8");
    } catch (error) {
      console.error("\uB85C\uADF8 \uD30C\uC77C \uC4F0\uAE30 \uC2E4\uD328:", error);
    }
  }
  /**
   * 검색 시작 로그
   */
  startSearch(productId, keyword) {
    const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const environment = this.detectEnvironment();
    this.activeSearches.set(searchId, {
      startTime: Date.now(),
      productId,
      keyword
    });
    const logData = {
      searchId,
      timestamp,
      environment,
      productId,
      keyword,
      step: "\uAC80\uC0C9_\uC2DC\uC791",
      status: "start",
      message: `[${environment.toUpperCase()}] \uAC80\uC0C9 \uC2DC\uC791 - \uC81C\uD488ID: ${productId}, \uD0A4\uC6CC\uB4DC: "${keyword}"`,
      data: {
        hostname: process.env.HOSTNAME || "unknown",
        cwd: process.cwd(),
        nodeEnv: process.env.NODE_ENV || "unknown",
        hasNaverKeys: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET)
      }
    };
    this.addLog(logData);
    return searchId;
  }
  /**
   * 진행 상황 로그
   */
  logProgress(searchId, step, message, data) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;
    const logData = {
      searchId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step,
      status: "progress",
      message,
      data,
      duration: Date.now() - search.startTime
    };
    this.addLog(logData);
  }
  /**
   * 성공 로그
   */
  logSuccess(searchId, step, message, data) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;
    const logData = {
      searchId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step,
      status: "success",
      message,
      data,
      duration: Date.now() - search.startTime
    };
    this.addLog(logData);
  }
  /**
   * 오류 로그
   */
  logError(searchId, step, message, error) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;
    const logData = {
      searchId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step,
      status: "error",
      message,
      error: error?.message || String(error),
      duration: Date.now() - search.startTime
    };
    this.addLog(logData);
  }
  /**
   * 검색 종료 로그
   */
  endSearch(searchId, found, finalRank, notes) {
    const search = this.activeSearches.get(searchId);
    if (!search) return;
    const duration = Date.now() - search.startTime;
    const logData = {
      searchId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: this.detectEnvironment(),
      productId: search.productId,
      keyword: search.keyword,
      step: "\uAC80\uC0C9_\uC644\uB8CC",
      status: "end",
      message: `[${this.detectEnvironment().toUpperCase()}] \uAC80\uC0C9 \uC644\uB8CC - ${found ? `${finalRank}\uC704 \uBC1C\uACAC` : "\uBBF8\uBC1C\uACAC"} (${duration}ms)`,
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
  addLog(logData) {
    this.logs.push(logData);
    const colorMap = {
      start: "\x1B[32m",
      // 초록
      progress: "\x1B[36m",
      // 청록
      success: "\x1B[33m",
      // 노랑
      error: "\x1B[31m",
      // 빨강
      end: "\x1B[35m"
      // 자주
    };
    const color = colorMap[logData.status] || "\x1B[0m";
    const reset = "\x1B[0m";
    console.log(`${color}[SEARCH-LOG] ${logData.message}${reset}`);
    this.writeToFile(`[SEARCH-LOG] ${logData.message}`);
    if (logData.data) {
      console.log(`${color}[SEARCH-DATA]${reset}`, JSON.stringify(logData.data, null, 2));
      this.writeToFile(`[SEARCH-DATA] ${JSON.stringify(logData.data)}`);
    }
    if (logData.error) {
      console.log(`${color}[SEARCH-ERROR]${reset}`, logData.error);
      this.writeToFile(`[SEARCH-ERROR] ${logData.error}`);
    }
    if (this.logs.length > 1e3) {
      this.logs = this.logs.slice(-500);
    }
  }
  /**
   * 특정 검색의 전체 로그 조회
   */
  getSearchLogs(searchId) {
    return this.logs.filter((log) => log.searchId === searchId);
  }
  /**
   * 최근 검색 로그들 조회
   */
  getRecentLogs(limit = 50) {
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
    const completedSearches = this.logs.filter((log) => log.status === "end");
    completedSearches.forEach((log) => {
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
  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }
  /**
   * 실서버 로그 파일 읽기 (디버깅용)
   */
  readLogFile() {
    try {
      if (import_fs.default.existsSync(this.logFilePath)) {
        return import_fs.default.readFileSync(this.logFilePath, "utf8");
      }
      return "\uB85C\uADF8 \uD30C\uC77C\uC774 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
    } catch (error) {
      return `\uB85C\uADF8 \uD30C\uC77C \uC77D\uAE30 \uC624\uB958: ${error}`;
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
      fileExists: import_fs.default.existsSync(this.logFilePath),
      fileSize: import_fs.default.existsSync(this.logFilePath) ? import_fs.default.statSync(this.logFilePath).size : 0
    };
  }
};
var searchLogger = new SearchLogger();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  searchLogger
});
