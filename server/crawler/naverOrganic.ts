// Naver OpenAPI 일반(오가닉) 순위 추적 — 속도/안정성 교정본
import type { RankResult } from "@shared/schema";
import { searchLogger } from "../utils/searchLogger.js";

const OPENAPI_BASE_URL = "https://openapi.naver.com/v1/search/shop.json";

// ----- 타입 -----
interface NaverShopItem {
  productId: string;
  mallName: string;
  link: string;
  lprice: string;
}
interface NaverShopResponse { 
  items: NaverShopItem[]; 
  total: number;
  start: number;
  display: number;
}
type IdParts = { productId?: string; prodNo?: string; nvMid?: string; };

// ----- 유틸: 숫자 문자열 비교 -----
function eqNumStr(a?: string | number | null, b?: string | number | null) {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}

// ----- 유틸: URL에서 ID 후보 추출 -----
function extractIdsFromUrl(u: string): IdParts {
  const out: IdParts = {};
  try {
    const mProd = u.match(/\/products\/(\d+)/i);
    if (mProd) out.prodNo = mProd[1];

    const mNvMid = u.match(/[?&]nvMid=(\d+)/i);
    if (mNvMid) out.nvMid = mNvMid[1];

    const mPid = u.match(/[?&]productId=(\d+)/i);
    if (mPid) out.productId = mPid[1];

    const mProdNoQ = u.match(/[?&]prodNo=(\d+)/i);
    if (mProdNoQ) out.prodNo = mProdNoQ[1] || out.prodNo;
  } catch {}
  return out;
}

// ----- 유틸: 실서버 환경 안정성 강화된 fetch -----
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 10000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error("timeout")), ms);
  try {
    // 실서버 환경 최적화 헤더
    const headers = {
      ...init.headers,
      "Accept": "*/*",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };
    return await fetch(input, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ----- 유틸: HEAD + manual redirect로 Location 뽑기 (빠르고 안전) -----
async function resolveLocationHead(url: string, headers: Record<string, string>, perHopTimeout = 8000, maxHops = 3): Promise<string> {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    try {
      const res = await fetchWithTimeout(current, {
        method: "HEAD",
        redirect: "manual",
        headers: {
          ...headers,
          "Accept": "*/*",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      }, perHopTimeout);

      // 3xx면 Location 추출
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (loc) {
          // 절대/상대 처리
          try { current = new URL(loc, current).href; } catch { current = loc; }
          continue; // 다음 hop
        }
        break; // 3xx인데 Location 없으면 중단
      }

      // 2xx면 current가 최종
      if (res.ok) return current;

      // 4xx/5xx면 중단
      console.warn(`[resolveLocationHead] HTTP ${res.status} for ${current}`);
      break;
    } catch (error: any) {
      console.warn(`[resolveLocationHead] hop ${hop} 실패:`, error.message);
      break;
    }
  }
  return current;
}

// ----- 메인 함수 -----
export async function fetchOrganicRank({
  keyword,
  productId: inputId,
  clientId,
  clientSecret,
}: {
  keyword: string;
  productId: string; // productId/prodNo/nvMid 아무거나 들어올 수 있음
  clientId: string;
  clientSecret: string;
}): Promise<RankResult> {
  const HARD_DEADLINE_MS = 15000; // 실서버 안정성: 15초로 단축
  const started = Date.now();
  // 실서버 환경에서 더 안전한 User-Agent 사용  
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const commonHeaders = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": "https://search.shopping.naver.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };

  try {
    // 검색 로그 시작
    const searchId = searchLogger.startSearch(inputId, keyword);
    
    console.log(`[organic] 시작: "${keyword}", inputId=${inputId}`);
    console.log(`[organic] 실서버 환경 최적화 - clientId 존재: ${!!clientId}, clientSecret 존재: ${!!clientSecret}`);
    
    searchLogger.logProgress(searchId, "환경_확인", "실서버 환경 최적화 설정 확인", {
      clientIdExists: !!clientId,
      clientSecretExists: !!clientSecret,
      hardDeadline: HARD_DEADLINE_MS
    });

    // 1) OpenAPI 호출 - 실서버 환경 최적화
    const callApi = async (start: number, retries = 2): Promise<NaverShopResponse> => {
      const url = `${OPENAPI_BASE_URL}?query=${encodeURIComponent(keyword)}&display=100&start=${start}&sort=sim`;
      
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetchWithTimeout(url, {
            headers: {
              "X-Naver-Client-Id": clientId,
              "X-Naver-Client-Secret": clientSecret,
              "User-Agent": ua,
              "Accept": "application/json, text/plain, */*",
              "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
              "Accept-Encoding": "gzip, deflate, br",
              "Cache-Control": "no-cache",
              "Pragma": "no-cache",
              "DNT": "1",
              "Connection": "keep-alive",
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "cross-site",
            },
          }, 8000); // 실서버 안정성: 8초로 단축
          
          if (!res.ok) {
            const errorText = await res.text();
            console.error(`OpenAPI 오류 (시도 ${attempt + 1}/${retries + 1}):`, res.status, errorText);
            if (attempt === retries) {
              throw new Error(`OpenAPI ${res.status}: ${errorText}`);
            }
            continue;
          }
          
          const jsonData = await res.json();
          console.log(`[organic] API 응답 성공 (start=${start}): total=${jsonData.total}, items=${jsonData.items?.length || 0}건`);
          
          searchLogger.logProgress(searchId, `API_호출_성공_${start}`, `네이버 OpenAPI 응답 성공`, {
            start,
            total: jsonData.total,
            itemsCount: jsonData.items?.length || 0,
            attempt: attempt + 1
          });
          
          return jsonData;
        } catch (error: any) {
          console.error(`API 호출 실패 (시도 ${attempt + 1}/${retries + 1}):`, error.message);
          if (attempt === retries) {
            throw error;
          }
          // 재시도 전 잠시 대기
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      
      throw new Error("API 호출 최대 재시도 횟수 초과");
    };

    // 실서버 안정성을 위해 순차 호출로 변경
    console.log("[organic] 1차 배치 요청 중...");
    const batch1 = await callApi(1);
    console.log(`[organic] 1차 배치 결과: ${batch1.items?.length || 0}건`);
    
    console.log("[organic] 2차 배치 요청 중...");
    const batch2 = await callApi(101);
    console.log(`[organic] 2차 배치 결과: ${batch2.items?.length || 0}건`);
    
    const allItems: NaverShopItem[] = [...(batch1.items ?? []), ...(batch2.items ?? [])];
    console.log(`[organic] 전체 아이템 수: ${allItems.length}건`);
    
    searchLogger.logProgress(searchId, "데이터_수집_완료", "OpenAPI 데이터 수집 완료", {
      batch1Count: batch1.items?.length || 0,
      batch2Count: batch2.items?.length || 0,
      totalItems: allItems.length,
      batch1Total: batch1.total,
      batch2Total: batch2.total
    });
    
    if (!allItems.length) {
      searchLogger.logError(searchId, "데이터_없음", "OpenAPI 결과 0건 - 실서버 네트워크 이슈 가능성");
      searchLogger.endSearch(searchId, false, undefined, ["OpenAPI 결과 0건 - 실서버 네트워크 이슈 가능성"]);
      return { productId: inputId, found: false, notes: ["OpenAPI 결과 0건 - 실서버 네트워크 이슈 가능성"] };
    }

    // 2) 1차: items[].productId 즉시 매칭 (가장 빠름)
    console.log(`[organic] 1차 매칭 시도 - 검색할 inputId: "${inputId}"`);
    console.log(`[organic] 처음 5개 아이템 productId: ${allItems.slice(0, 5).map(it => it.productId).join(', ')}`);
    
    searchLogger.logProgress(searchId, "1차_매칭_시도", "1차 매칭 시도 - productId 직접 비교", {
      searchInputId: inputId,
      first5ProductIds: allItems.slice(0, 5).map(it => it.productId),
      first5MallNames: allItems.slice(0, 5).map(it => it.mallName),
      first5Links: allItems.slice(0, 5).map(it => it.link)
    });
    
    let idx = allItems.findIndex((it) => eqNumStr(it.productId, inputId));
    console.log(`[organic] 1차 매칭 결과 - 찾은 인덱스: ${idx}`);
    
    searchLogger.logProgress(searchId, "1차_매칭_결과", `1차 매칭 결과: ${idx !== -1 ? '성공' : '실패'}`, {
      foundIndex: idx,
      found: idx !== -1
    });
    
    if (idx !== -1) {
      const hit = allItems[idx];
      const globalRank = idx + 1;
      const pageNumber = Math.ceil(globalRank / 40);
      const rankInPage = ((globalRank - 1) % 40) + 1;
      console.log(`[organic] 1차 매칭 성공! 순위: ${globalRank}위, 상품ID: ${hit.productId}`);
      
      const result = {
        productId: hit.productId,
        storeName: hit.mallName,
        storeLink: hit.link,
        price: parseInt(hit.lprice || "0", 10) || 0,
        globalRank,
        page: pageNumber,
        rankInPage,
        found: true,
        notes: ["1차: OpenAPI productId 매칭"],
      };
      
      searchLogger.logSuccess(searchId, "1차_매칭_성공", `1차 매칭 성공! ${globalRank}위 발견`, {
        matchedProductId: hit.productId,
        storeName: hit.mallName,
        globalRank,
        page: pageNumber,
        rankInPage,
        price: result.price
      });
      
      searchLogger.endSearch(searchId, true, globalRank, ["1차: OpenAPI productId 매칭"]);
      return result;
    }
    
    console.log(`[organic] 1차 매칭 실패 - "${inputId}"와 일치하는 productId 없음`);

    // 3) 실서버 환경 안전성: URL 기반 검색만 사용 (HEAD 요청 제거)
    console.log(`[organic] 2차 매칭 시도 - URL 기반 ID 추출만 사용 (실서버 안전)`);
    
    for (let i = 0; i < allItems.length; i++) {
      // 하드 데드라인 체크
      if (Date.now() - started > HARD_DEADLINE_MS) {
        console.log(`[organic] 시간 초과 - 하드 데드라인 ${HARD_DEADLINE_MS}ms 도달`);
        return { productId: inputId, found: false, notes: ["시간 초과(하드 타임박스)"] };
      }

      const item = allItems[i];
      
      try {
        // URL에서 ID 추출만 사용 (네트워크 요청 없음 - 실서버 안전)
        const ids = extractIdsFromUrl(item.link);
        
        const matched =
          eqNumStr(ids.prodNo, inputId) ||
          eqNumStr(ids.nvMid, inputId) ||
          eqNumStr(ids.productId, inputId) ||
          eqNumStr(item.productId, inputId);

        if (matched) {
          const globalRank = i + 1;
          const pageNumber = Math.ceil(globalRank / 40);
          const rankInPage = ((globalRank - 1) % 40) + 1;

          console.log(`[organic] 2차 매칭 성공! URL 기반 - 순위: ${globalRank}위`);
          
          const result = {
            productId: item.productId,
            storeName: item.mallName,
            storeLink: item.link,
            price: parseInt(item.lprice || "0", 10) || 0,
            globalRank,
            page: pageNumber,
            rankInPage,
            found: true,
            notes: ["2차: URL 기반 ID 매칭 (실서버 안전)"],
          };
          
          searchLogger.logSuccess(searchId, "2차_매칭_성공", `2차 매칭 성공! ${globalRank}위 발견`, {
            matchedProductId: item.productId,
            storeName: item.mallName,
            globalRank,
            page: pageNumber,
            rankInPage,
            price: result.price,
            extractedIds: ids,
            matchedUrl: item.link
          });
          
          searchLogger.endSearch(searchId, true, globalRank, ["2차: URL 기반 ID 매칭 (실서버 안전)"]);
          return result;
        }
      } catch (e: any) {
        // 개별 아이템 오류는 무시하고 계속 진행
        console.warn(`[organic] 아이템 ${i} 처리 오류:`, e?.message || String(e));
      }
    }

    // 4) 200위 내 미발견
    console.log(`[organic] 최종 결과: found=false, 전체 아이템 ${allItems.length}건 검색 완료`);
    console.log(`[organic] 모든 검색 방법 실패 - inputId: "${inputId}" 미발견`);
    
    searchLogger.logProgress(searchId, "검색_완료_미발견", "모든 검색 방법 시도 완료 - 미발견", {
      totalItemsSearched: allItems.length,
      searchMethods: ["1차: productId 직접 매칭", "2차: URL 기반 ID 추출"],
      inputId
    });
    
    const result = {
      productId: inputId,
      found: false,
      notes: ["상위 200위 내 미노출 또는 OpenAPI-실검색 불일치"],
    };
    
    searchLogger.endSearch(searchId, false, undefined, ["상위 200위 내 미노출 또는 OpenAPI-실검색 불일치"]);
    return result;
  } catch (err: any) {
    console.error(`[organic] 치명적 오류 - inputId: "${inputId}", keyword: "${keyword}"`);
    console.error(`[organic] 오류 상세:`, err?.message || String(err));
    console.error(`[organic] 오류 스택:`, err?.stack || 'No stack');
    
    // 치명적 오류가 발생한 경우 searchId를 임시로 생성
    const tempSearchId = searchLogger.startSearch(inputId, keyword);
    searchLogger.logError(tempSearchId, "치명적_오류", "검색 중 예외 발생", err);
    searchLogger.endSearch(tempSearchId, false, undefined, [`API 오류: ${err?.message || String(err)}`]);
    
    return {
      productId: inputId,
      found: false,
      notes: [`API 오류: ${err?.message || String(err)}`],
    };
  }
}