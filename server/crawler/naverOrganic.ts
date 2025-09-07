// Naver OpenAPI 일반(오가닉) 순위 추적 — 속도/안정성 교정본
import type { RankResult } from "@shared/schema";

const OPENAPI_BASE_URL = "https://openapi.naver.com/v1/search/shop.json";

// ----- 타입 -----
interface NaverShopItem {
  productId: string;
  mallName: string;
  link: string;
  lprice: string;
}
interface NaverShopResponse { items: NaverShopItem[]; }
type IdParts = { productId?: string; prodNo?: string; nvMid?: string; };

// ----- 유틸: 숫자 문자열 비교 -----
function eqNumStr(a?: string | number | null, b?: string | number | null) {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}

// ----- 유틸: URL에서 ID 후보 추출 (openapi redirect 대응) -----
function extractIdsFromUrl(u: string): IdParts {
  const out: IdParts = {};

  // 퍼센트 인코딩 안전 디코더 (여러 번 중첩된 경우 대비)
  const safeDecode = (s: string, times = 3) => {
    let cur = s;
    for (let i = 0; i < times; i++) {
      try {
        const dec = decodeURIComponent(cur);
        if (dec === cur) break;
        cur = dec;
      } catch {
        break;
      }
    }
    return cur;
  };

  // 검사 후보 URL 풀
  const candidates: string[] = [];
  candidates.push(u);
  candidates.push(safeDecode(u));

  // openapi.naver.com/l?...&url=<ENCODED_FINAL_URL> 형태 처리
  try {
    const url = new URL(u);
    const paramKeys = ["url", "u", "link", "redir", "redirect", "redirect_url"];
    for (const k of paramKeys) {
      const inner = url.searchParams.get(k);
      if (inner) {
        candidates.push(inner);
        candidates.push(safeDecode(inner));
      }
    }
  } catch {
    // noop
  }

  // 후보 문자열들에서 순서대로 패턴 매칭
  for (const s of candidates) {
    try {
      // 1) Smartstore: /products/123456
      const mProd = s.match(/\/products\/(\d+)/i);
      if (mProd && !out.prodNo) out.prodNo = mProd[1];

      // 2) Catalog: /catalog/123456 (중요!)
      const mCatalog = s.match(/\/catalog\/(\d+)/i);
      if (mCatalog && !out.productId) out.productId = mCatalog[1];

      // 3) Query 파라미터들
      const mNvMid = s.match(/[?&]nvMid=(\d+)/i);
      if (mNvMid && !out.nvMid) out.nvMid = mNvMid[1];

      const mPid = s.match(/[?&]productId=(\d+)/i);
      if (mPid && !out.productId) out.productId = mPid[1];

      const mProdNoQ = s.match(/[?&]prodNo=(\d+)/i);
      if (mProdNoQ && !out.prodNo) out.prodNo = mProdNoQ[1];

      // 4) 외부 몰 지원 (옥션, 11번가)
      const mAuction = s.match(/item-no=([A-Z0-9]+)/i);
      if (mAuction && !out.productId) out.productId = mAuction[1];

      const m11st = s.match(/prdNo=(\d+)/i);
      if (m11st && !out.productId) out.productId = m11st[1];

      if (out.prodNo || out.nvMid || out.productId) break; // 충분히 찾았으면 종료
    } catch {
      // 다음 후보 계속
    }
  }

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
  const HARD_DEADLINE_MS = 60000; // 실서버 안정성: 조기 종료 대응 60초로 안전 여유분 확보
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
    console.log(`[organic] 시작: "${keyword}", inputId=${inputId}`);
    console.log(`[organic] 실서버 환경 최적화 - clientId 존재: ${!!clientId}, clientSecret 존재: ${!!clientSecret}`);

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

    // 실서버 안정성을 위해 순차 호출로 변경 (1000위까지 확장, 조기 종료 최적화)
    let allProcessedItems: NaverShopItem[] = [];
    
    for (let batchNum = 1; batchNum <= 10; batchNum++) {
      // 하드 데드라인 체크
      if (Date.now() - started > HARD_DEADLINE_MS) {
        console.log(`[organic] 시간 초과 - 하드 데드라인 ${HARD_DEADLINE_MS}ms 도달, ${batchNum-1}차까지 완료`);
        break;
      }
      
      const start = (batchNum - 1) * 100 + 1;
      console.log(`[organic] ${batchNum}차 배치 요청 중... (${start}~${start+99}위)`);
      
      const batch = await callApi(start);
      console.log(`[organic] ${batchNum}차 배치 결과: ${batch.items?.length || 0}건`);
      
      if (!batch.items?.length) {
        console.log(`[organic] ${batchNum}차 배치 데이터 없음 - 검색 종료`);
        break;
      }
      
      // 현재 배치 아이템들을 전체 리스트에 추가
      allProcessedItems.push(...batch.items);
      
      // 1차 매칭: 현재 배치에서 productId 즉시 매칭
      for (let i = 0; i < batch.items.length; i++) {
        const item = batch.items[i];
        if (eqNumStr(item.productId, inputId)) {
          const globalRank = (batchNum - 1) * 100 + i + 1;
          const pageNumber = Math.ceil(globalRank / 40);
          const rankInPage = ((globalRank - 1) % 40) + 1;
          console.log(`[organic] ${batchNum}차 배치에서 즉시 매칭 성공! 순위: ${globalRank}위, 상품ID: ${item.productId}`);
          return {
            productId: item.productId,
            storeName: item.mallName,
            storeLink: item.link,
            price: parseInt(item.lprice || "0", 10) || 0,
            globalRank,
            page: pageNumber,
            rankInPage,
            found: true,
            notes: [`${batchNum}차 배치: OpenAPI productId 즉시 매칭`],
          };
        }
      }
      
      // 2차 매칭: 현재 배치에서 URL 기반 ID 매칭
      for (let i = 0; i < batch.items.length; i++) {
        const item = batch.items[i];
        try {
          const ids = extractIdsFromUrl(item.link);
          const matched =
            eqNumStr(ids.prodNo, inputId) ||
            eqNumStr(ids.nvMid, inputId) ||
            eqNumStr(ids.productId, inputId);
          
          if (matched) {
            const globalRank = (batchNum - 1) * 100 + i + 1;
            const pageNumber = Math.ceil(globalRank / 40);
            const rankInPage = ((globalRank - 1) % 40) + 1;
            console.log(`[organic] ${batchNum}차 배치에서 URL 매칭 성공! 순위: ${globalRank}위`);
            return {
              productId: item.productId,
              storeName: item.mallName,
              storeLink: item.link,
              price: parseInt(item.lprice || "0", 10) || 0,
              globalRank,
              page: pageNumber,
              rankInPage,
              found: true,
              notes: [`${batchNum}차 배치: URL 기반 ID 매칭`],
            };
          }
        } catch (e: any) {
          // 개별 아이템 오류는 무시하고 계속 진행
        }
      }
      
      console.log(`[organic] ${batchNum}차 배치 매칭 실패 - 다음 배치 진행`);
    }
    
    console.log(`[organic] 전체 처리된 아이템 수: ${allProcessedItems.length}건`);
    
    if (!allProcessedItems.length) {
      return { productId: inputId, found: false, notes: ["OpenAPI 결과 0건 - 실서버 네트워크 이슈 가능성"] };
    }

    // 4) 1000위 내 미발견
    console.log(`[organic] 최종 결과: found=false, 전체 아이템 ${allProcessedItems.length}건 검색 완료`);
    console.log(`[organic] 모든 검색 방법 실패 - inputId: "${inputId}" 미발견`);
    return {
      productId: inputId,
      found: false,
      notes: [`상위 ${allProcessedItems.length}개 아이템 내 미노출 또는 OpenAPI-실검색 불일치`],
    };
  } catch (err: any) {
    console.error(`[organic] 치명적 오류 - inputId: "${inputId}", keyword: "${keyword}"`);
    console.error(`[organic] 오류 상세:`, err?.message || String(err));
    console.error(`[organic] 오류 스택:`, err?.stack || 'No stack');
    return {
      productId: inputId,
      found: false,
      notes: [`API 오류: ${err?.message || String(err)}`],
    };
  }
}