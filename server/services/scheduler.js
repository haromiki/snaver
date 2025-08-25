import cron from "node-cron";
import { storage } from "../storage.js";
import { crawlProduct } from "../crawler/shoppingCrawler.js";
import { fetchOrganicRank } from "../crawler/naverOrganic.ts";
import { broadcastToClients } from "../websocket.js";

let isRunning = false;
let searchQueue = []; // 순차 검색 큐
let isProcessingQueue = false; // 큐 처리 중 플래그
let searchStatus = new Map(); // 제품별 검색 진행상태 추적

// Run every minute
cron.schedule("* * * * *", async () => {
  if (isRunning) {
    console.log("Scheduler already running, skipping...");
    return;
  }
  
  isRunning = true;
  
  try {
    const now = new Date();
    const currentMinute = now.getMinutes();
    
    console.log(`Scheduler tick: ${now.toISOString()}`);
    
    // 모든 사용자의 활성 제품 가져오기 (실서버 환경 개선)
    const allProducts = await getAllActiveProducts();
    
    for (const product of allProducts) {
      try {
        // 추적 시간인지 확인 (개선된 로직)
        console.log(`🔍 제품 ${product.id} 체크: intervalMin=${product.intervalMin}, currentMinute=${currentMinute}, 나머지=${currentMinute % product.intervalMin}`);
        
        if (currentMinute % product.intervalMin === 0) {
          console.log(`⏰ 스케줄 추가 - 제품 ${product.id}: ${product.keyword} (타입: ${product.type})`);
          
          // 큐에 추가 (순차 처리)
          searchQueue.push({
            product,
            timestamp: now.toISOString(),
            retries: 0
          });
        } else {
          // 실시간 업데이트 테스트를 위해 임시로 제품 22를 매분마다 실행
          if (product.id === 22) {
            console.log(`⏰ 테스트용 매분 실행 - 제품 ${product.id}: ${product.keyword} (타입: ${product.type})`);
            
            searchQueue.push({
              product,
              timestamp: now.toISOString(),
              retries: 0
            });
          }
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
      
      // 웹소켓으로 검색 시작 알림
      console.log('📡 웹소켓 검색 시작 이벤트 발송:', statusData);
      broadcastToClients({
        type: 'searchStarted',
        data: statusData
      });
      
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
      
      // 웹소켓으로 검색 완료 알림
      console.log('📡 웹소켓 검색 완료 이벤트 발송:', completedStatusData);
      broadcastToClients({
        type: 'searchCompleted',
        data: completedStatusData
      });
      
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
        
        // 웹소켓으로 검색 실패 알림
        broadcastToClients({
          type: 'searchFailed',
          data: failedStatusData
        });
      }
    }
  }
  
  isProcessingQueue = false;
  console.log(`✅ 큐 처리 완료`);
}

console.log("🚀 실서버 최적화 스케줄러 시작 - 매분 실행, OpenAPI 우선 사용, 순차 처리");

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
