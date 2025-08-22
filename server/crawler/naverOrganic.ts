// Naver OpenAPI를 사용한 일반(오가닉) 순위 추적
import type { RankResult } from "@shared/schema";

const OPENAPI_BASE_URL = "https://openapi.naver.com/v1/search/shop.json";

interface NaverShopItem {
  productId: string;
  mallName: string;
  link: string;
  lprice: string;
}

interface NaverShopResponse {
  items: NaverShopItem[];
}

export async function fetchOrganicRank({
  keyword,
  productId,
  clientId,
  clientSecret,
}: {
  keyword: string;
  productId: string;
  clientId: string;
  clientSecret: string;
}): Promise<RankResult> {
  // ⚠️ 중요: OpenAPI는 실제 네이버 쇼핑 검색 결과와 다를 수 있습니다
  // 200위 이내 제한으로 OpenAPI 사용 (사용자 확신에 따라)
  
  console.log(`🔍 OpenAPI 일반 순위 검색 시작: ${keyword} (${productId})`);
  
  try {
    // OpenAPI 2회 호출 (1-100, 101-200) - 200위 이내 제한
    const callApi = async (start: number): Promise<NaverShopResponse> => {
      const url = `${OPENAPI_BASE_URL}?query=${encodeURIComponent(keyword)}&display=100&start=${start}&sort=sim`;
      
      console.log(`🌐 API 호출: ${start}-${start+99}위`);
      
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

    console.log(`📊 총 ${allItems.length}개 상품 수집 완료`);

    // 타겟 상품 찾기
    const targetIndex = allItems.findIndex(
      (item) => String(item.productId) === String(productId)
    );

    if (targetIndex === -1) {
      console.log(`❌ 상품 미발견: ${productId}`);
      return {
        productId,
        found: false,
        notes: [`상위 200위 내 미노출`],
      };
    }

    const targetProduct = allItems[targetIndex];
    const globalRank = targetIndex + 1;
    const pageNumber = Math.ceil(globalRank / 40);
    const rankInPage = ((globalRank - 1) % 40) + 1;

    console.log(`✅ 제품 발견! 순위: ${globalRank}위 (${pageNumber}페이지 ${rankInPage}번째)`);
    
    return {
      productId,
      storeName: targetProduct.mallName,
      storeLink: targetProduct.link,
      price: parseInt(targetProduct.lprice) || 0,
      globalRank,
      page: pageNumber,
      rankInPage,
      found: true,
    };

  } catch (error: any) {
    console.error("OpenAPI 일반 순위 조회 오류:", error);
    
    return {
      productId,
      found: false,
      notes: [`API 오류: ${error.message}`],
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