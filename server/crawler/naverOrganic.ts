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
  try {
    // OpenAPI 2회 호출 (1-100, 101-200)
    const callApi = async (start: number): Promise<NaverShopResponse> => {
      const url = `${OPENAPI_BASE_URL}?query=${encodeURIComponent(keyword)}&display=100&start=${start}`;
      
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
    
    // 🔍 디버깅: API 응답 구조 확인 (파일로 저장)
    const debugInfo = {
      keyword,
      totalItems: allItems.length,
      searchingFor: productId,
      first5Items: allItems.slice(0, 5).map(item => ({
        productId: item.productId,
        mallName: item.mallName,
        keys: Object.keys(item)
      })),
      matchingTest: allItems.slice(0, 50).map((item, index) => ({
        rank: index + 1,
        productId: item.productId,
        matches: String(item.productId) === String(productId)
      }))
    };
    
    console.log("🔍 DEBUG INFO:", JSON.stringify(debugInfo, null, 2));

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
}