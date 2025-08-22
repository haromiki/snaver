// Naver OpenAPI를 사용한 일반(오가닉) 순위 추적 - 교정본
// - 1차: items[].productId 직접 매칭
// - 2차: 각 item.link 리다이렉트 최종 URL에서 prodNo/nvMid/productId를 추출해 재매칭
// - PC 기준 40개/페이지 환산 유지

import type { RankResult } from "@shared/schema";

const OPENAPI_BASE_URL = "https://openapi.naver.com/v1/search/shop.json";

interface NaverShopItem {
  productId: string;  // 네이버 쇼핑 상품 ID (OpenAPI 정의)
  mallName: string;
  link: string;       // openapi.naver.com/l?... → 최종 상품 URL로 리다이렉트됨
  lprice: string;
}

interface NaverShopResponse {
  items: NaverShopItem[];
}

type IdParts = {
  productId?: string; // nvMid나 prodNo와는 다른, 네이버 쇼핑 상품 ID
  prodNo?: string;    // 스마트스토어 상품번호 (/products/{prodNo})
  nvMid?: string;     // SERP/카탈로그 등에서 쓰이는 ID
};

// 최종 URL에서 prodNo/nvMid/productId 후보 추출
function extractIdsFromUrl(finalUrl: string): IdParts {
  const out: IdParts = {};
  try {
    // /products/{prodNo}
    const mProd = finalUrl.match(/\/products\/(\d+)/i);
    if (mProd) out.prodNo = mProd[1];

    // 쿼리 스트링에서 nvMid, productId, prodNo 등
    const mNvMid = finalUrl.match(/[?&]nvMid=(\d+)/i);
    if (mNvMid) out.nvMid = mNvMid[1];

    const mPid = finalUrl.match(/[?&]productId=(\d+)/i);
    if (mPid) out.productId = mPid[1];

    const mProdNoQ = finalUrl.match(/[?&]prodNo=(\d+)/i);
    if (mProdNoQ) out.prodNo = mProdNoQ[1] || out.prodNo;
  } catch {
    // 무시
  }
  return out;
}

// 안전한 숫자 문자열 비교(선행 0/형 변환 흔들림 방지)
function eqNumStr(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}

export async function fetchOrganicRank({
  keyword,
  productId: inputId,
  clientId,
  clientSecret,
}: {
  keyword: string;
  productId: string; // 입력: productId 또는 prodNo 또는 nvMid일 수 있다고 가정
  clientId: string;
  clientSecret: string;
}): Promise<RankResult> {
  console.log(`[organic] OpenAPI 일반 순위 검색 시작: keyword="${keyword}", inputId=${inputId}`);

  try {
    // OpenAPI 2회 호출 (1-100, 101-200)
    const callApi = async (start: number): Promise<NaverShopResponse> => {
      const url = `${OPENAPI_BASE_URL}?query=${encodeURIComponent(keyword)}&display=100&start=${start}&sort=sim`;

      const response = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "User-Agent": "SNAVER-Ranking-Tracker/1.0",
        },
        // 기본 redirect: 'follow'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAPI ${response.status}: ${errorText}`);
      }
      return response.json();
    };

    // 병렬로 1-100, 101-200 조회
    const [batch1, batch2] = await Promise.all([callApi(1), callApi(101)]);
    const allItems: NaverShopItem[] = [...(batch1.items ?? []), ...(batch2.items ?? [])];
    console.log(`[organic] OpenAPI 수집 완료: ${allItems.length}개`);

    // 1차: OpenAPI productId 직접 매칭
    let idx = allItems.findIndex((it) => eqNumStr(it.productId, inputId));
    if (idx !== -1) {
      const hit = allItems[idx];
      const globalRank = idx + 1;
      const pageNumber = Math.ceil(globalRank / 40);
      const rankInPage = ((globalRank - 1) % 40) + 1;
      console.log(`[organic] 1차 매칭 성공: globalRank=${globalRank}, page=${pageNumber}, rankInPage=${rankInPage}`);
      return {
        productId: hit.productId,
        storeName: hit.mallName,
        storeLink: hit.link,
        price: parseInt(hit.lprice || "0", 10) || 0,
        globalRank,
        page: pageNumber,
        rankInPage,
        found: true,
      };
    }

    // 2차: 최종 URL 추출 기반 매칭 (prodNo/nvMid/productId 후보)
    console.log(`[organic] 1차 매칭 실패 → 최종 URL 추출 기반 2차 매칭 시도`);
    const MAX_PARALLEL = 8;
    for (let base = 0; base < allItems.length; base += MAX_PARALLEL) {
      const slice = allItems.slice(base, base + MAX_PARALLEL);

      // 병렬로 최종 URL 확인
      const results = await Promise.all(
        slice.map(async (it) => {
          try {
            // openapi 링크는 최종 상품 URL로 리다이렉트됨
            const resp = await fetch(it.link, { redirect: "follow" });
            const finalUrl = resp.url || it.link;

            const ids = extractIdsFromUrl(finalUrl);
            // 입력값이 productId/prodNo/nvMid 중 무엇이든 매칭되도록 비교
            const matched =
              eqNumStr(ids.prodNo, inputId) ||
              eqNumStr(ids.nvMid, inputId) ||
              eqNumStr(ids.productId, inputId) ||
              eqNumStr(it.productId, inputId);

            return { it, finalUrl, ids, matched };
          } catch (e) {
            return { it, finalUrl: it.link, ids: {}, matched: false };
          }
        })
      );

      // 매칭된 항목 찾기
      const pos = results.findIndex((r) => r.matched);
      if (pos !== -1) {
        idx = base + pos;
        const target = results[pos].it;
        const globalRank = idx + 1;
        const pageNumber = Math.ceil(globalRank / 40);
        const rankInPage = ((globalRank - 1) % 40) + 1;

        console.log(
          `[organic] 2차 매칭 성공: globalRank=${globalRank}, page=${pageNumber}, rankInPage=${rankInPage}, finalUrl=${results[pos].finalUrl}`
        );

        return {
          productId: target.productId,
          storeName: target.mallName,
          storeLink: results[pos].finalUrl || target.link,
          price: parseInt(target.lprice || "0", 10) || 0,
          globalRank,
          page: pageNumber,
          rankInPage,
          found: true,
          notes: ["최종 URL 기반 매칭(prodNo/nvMid 포함)"],
        };
      }
    }

    // 여기까지 못 찾으면 200위 내 미노출 판단
    console.log(`[organic] 미발견: 입력 제품번호(${inputId})와 일치하는 상품 없음`);
    return {
      productId: inputId,
      found: false,
      notes: ["상위 200위 내 미노출 또는 OpenAPI-실검색 불일치"],
    };
  } catch (error: any) {
    console.error("[organic] OpenAPI 일반 순위 조회 오류:", error?.message || error);
    return {
      productId: inputId,
      found: false,
      notes: [`API 오류: ${error?.message || String(error)}`],
    };
  }
  
  /* 원본 OpenAPI 방식 - 실제 검색과 결과 불일치
  try {
  try {
    // OpenAPI 2회 호출 (1-100, 101-200)
    const callApi = async (start: number): Promise<NaverShopResponse> => {
      const url = `${OPENAPI_BASE_URL}?query=${encodeURIComponent(keyword)}&display=100&start=${start}&sort=sim`;
      
      const response = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "User-Agent": "SNAVER-Ranking-Tracker/1.0",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAPI ${response.status}: ${errorText}`);
      }

      return response.json();
    };

    // 병렬로 1-100, 101-200 조회
    const [batch1, batch2] = await Promise.all([
      callApi(1),
      callApi(101),
    ]);

    // 모든 아이템 합치기 (최대 200개)
    const allItems = [...(batch1.items ?? []), ...(batch2.items ?? [])];

    // 타겟 상품 찾기
    const targetIndex = allItems.findIndex(
      (item) => String(item.productId) === String(productId)
    );

    if (targetIndex === -1) {
      return {
        productId,
        found: false,
        notes: ["상위 200위 내 미노출"],
      };
    }

    const targetItem = allItems[targetIndex];
    const globalRank = targetIndex + 1; // 1-based 순위
    const page = Math.ceil(globalRank / 40); // PC 기준 40개/페이지
    const rankInPage = ((globalRank - 1) % 40) + 1; // 페이지 내 순위

    return {
      productId,
      storeName: targetItem.mallName,
      storeLink: targetItem.link,
      price: Number(targetItem.lprice),
      globalRank,
      page,
      rankInPage,
      found: true,
    };

  } catch (error: any) {
    console.error("오가닉 랭킹 조회 오류:", error);
    
    return {
      productId,
      found: false,
      notes: [`API 오류: ${error.message}`],
    };
  }
  */
}