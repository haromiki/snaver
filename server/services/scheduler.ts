import cron from "node-cron";
import { storage } from "../storage.ts";
import { crawlProduct } from "../crawler/shoppingCrawler.js";
import { fetchOrganicRank } from "../crawler/naverOrganic.ts";
import { broadcastSearchStarted, broadcastSearchCompleted, broadcastSearchFailed } from "../sse.ts";

let isRunning = false;
let searchQueue = []; // 순차 검색 큐
let isProcessingQueue = false; // 큐 처리 중 플래그
let searchStatus = new Map(); // 제품별 검색 진행상태 추적

// Run every 10 seconds for real-time updates
cron.schedule("*/10 * * * * *", async () => {
  if (isRunning) {
    console.log("Scheduler already running, skipping...");
    return;
  }
  
  isRunning = true;
  
  try {
    const now = new Date();
    const currentSecond = Math.floor(now.getTime() / 1000); // 초 단위로 계산
    
    console.log(`Scheduler tick: ${now.toISOString()}`);
    
    // 모든 사용자의 활성 제품 가져오기 (실서버 환경 개선)
    const allProducts = await getAllActiveProducts();
    
    for (const product of allProducts) {
      try {
        // 실시간 업데이트를 위해 intervalMin을 초 단위로 변환 (60분 = 3600초)
        const intervalSeconds = product.intervalMin * 60; // 분을 초로 변환
        
        console.log(`🔍 제품 ${product.id} 체크: intervalMin=${product.intervalMin}분(${intervalSeconds}초), currentSecond=${currentSecond}, 나머지=${currentSecond % intervalSeconds}`);
        
        if (currentSecond % intervalSeconds === 0) {
          console.log(`⏰ 스케줄 추가 - 제품 ${product.id}: ${product.keyword} (타입: ${product.type})`);
          
          // 큐에 추가 (순차 처리)
          searchQueue.push({
            product,
            timestamp: now.toISOString(),
            retries: 0
          });
        }
      } catch (error) {
        console.error(`스케줄 체크 오류 - 제품 ${product.id}:`, error);
      }
    }
    
    // 큐 처리 시작
    if (!isProcessingQueue && searchQueue.length > 0) {
      processSearchQueue();
    }
    
  } catch (error) {
    console.error("Scheduler error:", error);
  } finally {
    isRunning = false;
  }
});

// 모든 사용자의 활성 제품 가져오기 (실서버 환경 개선)
async function getAllActiveProducts() {
  try {
    // 모든 사용자 조회
    const allUsers = await storage.getAllUsers(); // 이 함수가 없으면 추가 필요
    const allProducts = [];
    
    for (const user of allUsers) {
      const userProducts = await storage.getProducts(user.id, { active: true });
      allProducts.push(...userProducts);
    }
    
    console.log(`📊 전체 활성 제품 수: ${allProducts.length}개`);
    return allProducts;
  } catch (error) {
    console.error("활성 제품 조회 오류:", error);
    return [];
  }
}

// 순차 검색 큐 처리기 (실서버 안정성 개선)
async function processSearchQueue() {
  if (isProcessingQueue) return;
  
  isProcessingQueue = true;
  console.log(`🔄 큐 처리 시작 - 대기 중인 작업: ${searchQueue.length}개`);
  
  while (searchQueue.length > 0) {
    const { product, timestamp, retries } = searchQueue.shift();
    
    try {
      console.log(`🔍 검색 시작 - 제품 ${product.id}: "${product.keyword}" (${product.type}타입)`);
      
      // 진행상태 업데이트
      const statusData = {
        productId: product.id,
        productName: product.productName,
        keyword: product.keyword,
        status: 'searching',
        startTime: new Date(),
        retries: retries,
        lastUpdate: new Date()
      };
      searchStatus.set(product.id, statusData);
      
      // SSE로 검색 시작 알림
      console.log('📡 SSE 검색 시작 이벤트 발송:', statusData);
      broadcastSearchStarted(product.id, product.keyword);
      
      let result;
      
      // 실서버 안정성: OpenAPI 우선 사용, Puppeteer는 fallback
      if (product.type === "organic") {
        // 일반 검색: OpenAPI 사용 (실서버에서 안정적)
        const clientId = process.env.NAVER_CLIENT_ID;
        const clientSecret = process.env.NAVER_CLIENT_SECRET;
        
        if (clientId && clientSecret) {
          console.log(`📡 OpenAPI 사용 - 제품 ${product.id}`);
          const apiResult = await fetchOrganicRank({
            keyword: product.keyword,
            productId: product.productNo,
            clientId,
            clientSecret
          });
          
          // OpenAPI 결과를 기존 형식으로 변환
          if (apiResult.found) {
            result = {
              notFound: false,
              is_ad: false,
              page: apiResult.page,
              rank_on_page: apiResult.rankInPage,
              global_rank: apiResult.globalRank,
              price_krw: apiResult.price,
              mall_name: apiResult.storeName,
              product_link: apiResult.storeLink
            };
          } else {
            result = { notFound: true };
          }
        } else {
          console.log(`⚠️ OpenAPI 인증정보 없음 - Puppeteer 사용`);
          result = await crawlProduct(product);
        }
      } else {
        // 광고 검색: Puppeteer 사용 (OpenAPI로는 광고 구분 불가)
        console.log(`🎯 Puppeteer 사용 - 광고 검색 제품 ${product.id}`);
        result = await crawlProduct(product);
      }
      
      // 결과 저장
      await storage.createTrack({
        productId: product.id,
        isAd: result.notFound ? false : result.is_ad,
        page: result.notFound ? null : result.page,
        rankOnPage: result.notFound ? null : result.rank_on_page,
        globalRank: result.notFound ? null : result.global_rank,
        priceKrw: result.notFound ? null : result.price_krw,
        mallName: result.notFound ? null : result.mall_name,
        productLink: result.notFound ? null : result.product_link,
      });
      
      console.log(`✅ 저장 완료 - 제품 ${product.id}: ${result.notFound ? "미발견" : `${result.global_rank}위`}`);
      
      // 진행상태 완료로 업데이트
      const completedStatusData = {
        productId: product.id,
        productName: product.productName,
        keyword: product.keyword,
        status: 'completed',
        result: result.notFound ? "미발견" : `${result.global_rank}위`,
        rank: result.global_rank,
        startTime: searchStatus.get(product.id)?.startTime || new Date(),
        completeTime: new Date(),
        retries: retries,
        lastUpdate: new Date()
      };
      searchStatus.set(product.id, completedStatusData);
      
      // SSE로 검색 완료 알림
      console.log('📡 SSE 검색 완료 이벤트 발송:', completedStatusData);
      broadcastSearchCompleted(product.id, completedStatusData);
      
      // 검색 간 지연 (속도 최적화 - 실서버 안정성 확보됨)
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ 검색 실패 - 제품 ${product.id}:`, error.message);
      
      // 재시도 로직 (최대 2회)
      if (retries < 2) {
        console.log(`🔄 재시도 ${retries + 1}/2 - 제품 ${product.id}`);
        searchQueue.push({
          product,
          timestamp,
          retries: retries + 1
        });
        
        // 진행상태를 재시도로 업데이트
        searchStatus.set(product.id, {
          productId: product.id,
          productName: product.productName,
          keyword: product.keyword,
          status: 'retrying',
          retries: retries + 1,
          error: error.message,
          startTime: searchStatus.get(product.id)?.startTime || new Date(),
          lastUpdate: new Date()
        });
        
        // 재시도 전 지연 (단축)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`💥 최대 재시도 초과 - 제품 ${product.id} 건너뜀`);
        
        // 진행상태를 실패로 업데이트
        const failedStatusData = {
          productId: product.id,
          productName: product.productName,
          keyword: product.keyword,
          status: 'failed',
          error: error.message,
          retries: retries,
          startTime: searchStatus.get(product.id)?.startTime || new Date(),
          failTime: new Date(),
          lastUpdate: new Date()
        };
        searchStatus.set(product.id, failedStatusData);
        
        // SSE로 검색 실패 알림
        broadcastSearchFailed(product.id, error.message);
      }
    }
  }
  
  isProcessingQueue = false;
  console.log(`✅ 큐 처리 완료`);
}

console.log("🚀 실서버 최적화 스케줄러 시작 - 매분 실행, OpenAPI 우선 사용, 순차 처리");

// 매일 자정 (한국시간) - 일간 통계 업데이트 및 데이터 정리
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("🗑️ 3년 이상 된 데이터 자동 정리 시작...");
    const cleanupResult = await storage.cleanupOldData();
    console.log("✅ 데이터 정리 완료:", cleanupResult);

    console.log("📊 일간 통계 업데이트 시작...");
    await updateDailyStatistics();
    console.log("✅ 일간 통계 업데이트 완료");

    console.log("📊 주간 차트 스냅샷 생성 시작...");
    await createWeeklyChartSnapshots();
    console.log("✅ 주간 차트 스냅샷 생성 완료");
  } catch (error) {
    console.error("❌ 자정 작업 중 오류:", error);
  }
}, {
  timezone: "Asia/Seoul"
});

// 매주 월요일 자정 (한국시간) - 주간 통계 갱신
cron.schedule("0 0 * * 1", async () => {
  try {
    console.log("📊 주간 통계 갱신 시작...");
    await updateWeeklyStatistics();
    console.log("✅ 주간 통계 갱신 완료");
  } catch (error) {
    console.error("❌ 주간 통계 갱신 중 오류:", error);
  }
}, {
  timezone: "Asia/Seoul"
});

// 매월 1일 자정 (한국시간) - 월간 통계 재계산
cron.schedule("0 0 1 * *", async () => {
  try {
    console.log("📊 월간 통계 재계산 시작...");
    await updateMonthlyStatistics();
    console.log("✅ 월간 통계 재계산 완료");
  } catch (error) {
    console.error("❌ 월간 통계 재계산 중 오류:", error);
  }
}, {
  timezone: "Asia/Seoul"
});

// 매년 1월 1일 자정 (한국시간) - 연간 통계 재계산
cron.schedule("0 0 1 1 *", async () => {
  try {
    console.log("📊 연간 통계 재계산 시작...");
    await updateYearlyStatistics();
    console.log("✅ 연간 통계 재계산 완료");
  } catch (error) {
    console.error("❌ 연간 통계 재계산 중 오류:", error);
  }
}, {
  timezone: "Asia/Seoul"
});

// 통계 업데이트 함수들
async function updateDailyStatistics() {
  const allUsers = await getAllActiveProducts();
  const productIds = [...new Set(allUsers.map(p => p.id))];
  
  const yesterday = getKSTDate(-1);
  const todayStart = getKSTDate(0);
  
  for (const productId of productIds) {
    try {
      const statData = await storage.calculateStatistics(productId, 'daily', yesterday, todayStart);
      if (statData) {
        await storage.createStatistic(statData);
        console.log(`✅ 일간 통계 저장 - 제품 ${productId}`);
      }
    } catch (error) {
      console.error(`❌ 일간 통계 계산 실패 - 제품 ${productId}:`, error);
    }
  }
}

async function updateWeeklyStatistics() {
  const allUsers = await getAllActiveProducts();
  const productIds = [...new Set(allUsers.map(p => p.id))];
  
  const lastWeekStart = getKSTDate(-7);
  const thisWeekStart = getKSTDate(0);
  
  for (const productId of productIds) {
    try {
      const statData = await storage.calculateStatistics(productId, 'weekly', lastWeekStart, thisWeekStart);
      if (statData) {
        await storage.createStatistic(statData);
        console.log(`✅ 주간 통계 저장 - 제품 ${productId}`);
      }
    } catch (error) {
      console.error(`❌ 주간 통계 계산 실패 - 제품 ${productId}:`, error);
    }
  }
}

async function updateMonthlyStatistics() {
  const allUsers = await getAllActiveProducts();
  const productIds = [...new Set(allUsers.map(p => p.id))];
  
  const lastMonthStart = getKSTDate(-30);
  const thisMonthStart = getKSTDate(0);
  
  for (const productId of productIds) {
    try {
      const statData = await storage.calculateStatistics(productId, 'monthly', lastMonthStart, thisMonthStart);
      if (statData) {
        await storage.createStatistic(statData);
        console.log(`✅ 월간 통계 저장 - 제품 ${productId}`);
      }
    } catch (error) {
      console.error(`❌ 월간 통계 계산 실패 - 제품 ${productId}:`, error);
    }
  }
}

async function updateYearlyStatistics() {
  const allUsers = await getAllActiveProducts();
  const productIds = [...new Set(allUsers.map(p => p.id))];
  
  const lastYearStart = getKSTDate(-365);
  const thisYearStart = getKSTDate(0);
  
  for (const productId of productIds) {
    try {
      const statData = await storage.calculateStatistics(productId, 'yearly', lastYearStart, thisYearStart);
      if (statData) {
        await storage.createStatistic(statData);
        console.log(`✅ 연간 통계 저장 - 제품 ${productId}`);
      }
    } catch (error) {
      console.error(`❌ 연간 통계 계산 실패 - 제품 ${productId}:`, error);
    }
  }
}

// 주간 차트 스냅샷 생성 함수 (매일 자정 실행)
async function createWeeklyChartSnapshots() {
  const allUsers = await getAllActiveProducts();
  const productIds = [...new Set(allUsers.map(p => p.id))];
  
  for (const productId of productIds) {
    try {
      // 현재 주간 데이터를 가져와서 스냅샷으로 저장
      const kstNow = new Date();
      const kstToday = new Date(kstNow.getTime() + (9 * 60 * 60 * 1000));
      const dayOfWeek = kstToday.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      // 한국시간 기준 이번 주 월요일 00:00
      const thisWeekMonday = new Date(kstToday.getTime() - (daysFromMonday * 24 * 60 * 60 * 1000));
      thisWeekMonday.setHours(0, 0, 0, 0);
      
      // 다음 주 월요일 00:00
      const nextWeekMonday = new Date(thisWeekMonday);
      nextWeekMonday.setDate(thisWeekMonday.getDate() + 7);
      
      // 이번 주 데이터 조회
      const weeklyRanks = await storage.getProductTracksInRange(
        productId, 
        allUsers.find(p => p.id === productId)?.userId || 0,
        thisWeekMonday.toISOString(),
        nextWeekMonday.toISOString()
      );
      
      // 요일별 최신 순위 데이터로 정리
      const dailyRanks = [];
      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(thisWeekMonday);
        targetDate.setDate(thisWeekMonday.getDate() + i);
        
        const dayName = ['월', '화', '수', '목', '금', '토', '일'][i];
        
        // 해당 날짜의 트랙 데이터 중 가장 최근 것
        const dayTracks = weeklyRanks.filter((track) => {
          const trackDate = new Date(track.checkedAt);
          const kstTrackDate = new Date(trackDate.getTime() + (9 * 60 * 60 * 1000));
          const kstTargetDate = new Date(targetDate.getTime() + (9 * 60 * 60 * 1000));
          return kstTrackDate.toDateString() === kstTargetDate.toDateString();
        });
        
        const latestTrack = dayTracks.length > 0 ? 
          dayTracks.sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())[0] : null;
        
        dailyRanks.push({
          day: dayName,
          date: targetDate.toISOString().split('T')[0],
          rank: latestTrack?.globalRank || null,
          hasData: !!latestTrack
        });
      }
      
      // 주간 차트 스냅샷 저장
      await storage.createWeeklyChart({
        productId,
        weekStart: thisWeekMonday,
        chartData: JSON.stringify(dailyRanks)
      });
      
      console.log(`✅ 주간 차트 저장 - 제품 ${productId}, 주 시작: ${thisWeekMonday.toISOString().split('T')[0]}`);
    } catch (error) {
      console.error(`❌ 주간 차트 생성 실패 - 제품 ${productId}:`, error);
    }
  }
}

// 한국시간 기준 날짜 계산 함수
function getKSTDate(daysOffset = 0) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
  kstNow.setDate(kstNow.getDate() + daysOffset);
  kstNow.setHours(0, 0, 0, 0); // 자정으로 설정
  return kstNow;
}

// 진행상태 조회 함수 (routes.ts에서 사용)
export function getSearchStatus() {
  const statusArray = Array.from(searchStatus.values());
  
  // 30분 이전 완료된 항목들은 제거 (메모리 정리)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  for (const [productId, status] of searchStatus.entries()) {
    if (status.status === 'completed' && status.completeTime && status.completeTime < thirtyMinutesAgo) {
      searchStatus.delete(productId);
    }
  }
  
  return {
    isProcessing: isProcessingQueue,
    queueLength: searchQueue.length,
    activeSearches: statusArray,
    lastUpdate: new Date()
  };
}
