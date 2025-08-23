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
  const HARD_DEADLINE_MS = 45000; // 실서버 환경 고려해서 45초로 증가
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
          }, 12000); // 12초로 증가
          
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

    // 실서버 안정성을 위해 순차 호출로 변경
    console.log("[organic] 1차 배치 요청 중...");
    const batch1 = await callApi(1);
    console.log(`[organic] 1차 배치 결과: ${batch1.items?.length || 0}건`);
    
    console.log("[organic] 2차 배치 요청 중...");
    const batch2 = await callApi(101);
    console.log(`[organic] 2차 배치 결과: ${batch2.items?.length || 0}건`);
    
    const allItems: NaverShopItem[] = [...(batch1.items ?? []), ...(batch2.items ?? [])];
    console.log(`[organic] 전체 아이템 수: ${allItems.length}건`);
    
    if (!allItems.length) {
      return { productId: inputId, found: false, notes: ["OpenAPI 결과 0건 - 실서버 네트워크 이슈 가능성"] };
    }

    // 2) 1차: items[].productId 즉시 매칭 (가장 빠름)
    console.log(`[organic] 1차 매칭 시도 - 검색할 inputId: "${inputId}"`);
    console.log(`[organic] 처음 5개 아이템 productId: ${allItems.slice(0, 5).map(it => it.productId).join(', ')}`);
    
    let idx = allItems.findIndex((it) => eqNumStr(it.productId, inputId));
    console.log(`[organic] 1차 매칭 결과 - 찾은 인덱스: ${idx}`);
    
    if (idx !== -1) {
      const hit = allItems[idx];
      const globalRank = idx + 1;
      const pageNumber = Math.ceil(globalRank / 40);
      const rankInPage = ((globalRank - 1) % 40) + 1;
      console.log(`[organic] 1차 매칭 성공! 순위: ${globalRank}위, 상품ID: ${hit.productId}`);
      return {
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
    }
    
    console.log(`[organic] 1차 매칭 실패 - "${inputId}"와 일치하는 productId 없음`);

    // 3) 2차: 리다이렉트 Location만 해석(HEAD) → ID 매칭
    //  - 최종 GET까지 가지 않음(느리고 행 가능). 빠르게 Location 체인만 추적.
    const MAX_PARALLEL = 12;
    for (let base = 0; base < allItems.length; base += MAX_PARALLEL) {
      // 하드 데드라인 체크
      if (Date.now() - started > HARD_DEADLINE_MS) {
        console.log(`[organic] 시간 초과 - 하드 데드라인 ${HARD_DEADLINE_MS}ms 도달`);
        return { productId: inputId, found: false, notes: ["시간 초과(하드 타임박스)"] };
      }

      const slice = allItems.slice(base, base + MAX_PARALLEL);

      const settled = await Promise.allSettled(
        slice.map(async (it) => {
          try {
            // 3-a) 먼저 링크 자체에서 ID가 보이면 바로 비교(아주 빠름)
            const id0 = extractIdsFromUrl(it.link);
            if (
              eqNumStr(id0.prodNo, inputId) ||
              eqNumStr(id0.nvMid, inputId) ||
              eqNumStr(id0.productId, inputId)
            ) {
              return { it, finalUrl: it.link, ids: id0, matched: true };
            }

            // 3-b) HEAD+manual 로 Location 체인만 해석
            const finalUrl = await resolveLocationHead(it.link, commonHeaders, 4000, 3);
            const ids = extractIdsFromUrl(finalUrl);

            const matched =
              eqNumStr(ids.prodNo, inputId) ||
              eqNumStr(ids.nvMid, inputId) ||
              eqNumStr(ids.productId, inputId) ||
              eqNumStr(it.productId, inputId);

            return { it, finalUrl, ids, matched };
          } catch (e: any) {
            return { it, finalUrl: it.link, ids: {}, matched: false, error: e?.message || String(e) };
          }
        })
      );

      const ok = settled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map((r) => r.value);

      const pos = ok.findIndex((r) => r.matched);
      if (pos !== -1) {
        idx = base + pos;
        const r = ok[pos];
        const globalRank = idx + 1;
        const pageNumber = Math.ceil(globalRank / 40);
        const rankInPage = ((globalRank - 1) % 40) + 1;

        return {
          productId: r.it.productId,
          storeName: r.it.mallName,
          storeLink: r.finalUrl || r.it.link,
          price: parseInt(r.it.lprice || "0", 10) || 0,
          globalRank,
          page: pageNumber,
          rankInPage,
          found: true,
          notes: ["2차: redirect Location(HEAD) 기반 매칭"],
        };
      }
      // 실패한 요청은 다음 슬라이스로 계속 진행 (행 방지)
    }

    // 4) 200위 내 미발견
    console.log(`[organic] 최종 결과: found=false, 전체 아이템 ${allItems.length}건 검색 완료`);
    console.log(`[organic] 모든 검색 방법 실패 - inputId: "${inputId}" 미발견`);
    return {
      productId: inputId,
      found: false,
      notes: ["상위 200위 내 미노출 또는 OpenAPI-실검색 불일치"],
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