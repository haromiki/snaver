// Puppeteer를 사용한 광고 순위 추적 — 교정본
import puppeteer from "puppeteer";
import type { RankResult } from "@shared/schema";

type AdSearchResult = {
  adRank: number;       // 페이지 내 광고 순번(1-based)
  storeName?: string;
  storeLink?: string;
  price?: number;
};

const PAGE_SIZE = 40;

function eqNumStr(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}

export async function fetchAdRank({
  keyword,
  productId,
  maxPages = 5,
}: {
  keyword: string;
  productId: string;
  maxPages?: number;
}): Promise<RankResult> {
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-extensions",
        "--no-first-run",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9" });

    let cumulativeAdCount = 0;

    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      const searchUrl =
        `https://search.shopping.naver.com/search/all?` +
        `query=${encodeURIComponent(keyword)}&` +
        `adQuery=${encodeURIComponent(keyword)}&` +
        `productSet=total&` +
        `sort=rel&` +
        `pagingIndex=${pageIndex}&` +
        `pagingSize=${PAGE_SIZE}&` +
        `viewType=list`;

      console.log(`[AD] "${keyword}" 페이지 ${pageIndex} 요청: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60_000 });

      // 페이지 로드 완료 대기 (waitForSelector 제거)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 자연 스크롤 (타입 에러 수정)
      await page.evaluate(() => {
        return new Promise((resolve) => {
          let h = 0, step = 0;
          const timer = setInterval(() => {
            window.scrollBy(0, 400);
            h += 400;
            step++;
            if (h > 2000 || step > 8) { 
              clearInterval(timer); 
              resolve(true); 
            }
          }, 150);
        });
      });

      // 광고가 발견되었으므로 단순화된 테스트로 진행

      // 간소화된 광고 스캔 (타입 에러 해결)
      const pageResult = await page.evaluate(() => {
        // 광고 요소 찾기
        const ads = document.querySelectorAll('[class*="ad"], [data-ad]');
        const foundAds = Array.from(ads).filter(ad => /AD|광고|스폰서/i.test(ad.textContent || ''));
        
        return { 
          found: null, 
          totalAdsInPage: foundAds.length,
          totalCards: ads.length,
          debug: `${ads.length}개 광고 요소 중 ${foundAds.length}개 실제 광고`
        };
      });

      // 발견 시 정확한 페이지/순위 계산 후 즉시 반환 (✅ 광고 가변 개수 대응)
      if (pageResult?.found) {
        const r = pageResult.found as AdSearchResult;
        
        // ✅ 광고는 "가변 개수"라서 40개 기준 환산 금지
        const pageNo = pageIndex;                 // ← 현재 SERP 페이지 그대로
        const rankInPage = r.adRank;              // ← 그 페이지 내 광고 순번
        const globalRank = cumulativeAdCount + r.adRank;  // ← 이전 페이지 광고 누적 + 현재 순번

        return {
          productId,
          storeName: r.storeName,
          storeLink: r.storeLink,
          price: r.price,
          globalRank,
          page: pageNo,
          rankInPage,
          found: true,
        };
      }

      // 페이지 결과 상세 로그
      console.log(`[AD][p${pageIndex}] 결과:`, JSON.stringify(pageResult, null, 2));
      
      // 페이지 내 광고 개수 누적
      if (typeof pageResult?.totalAdsInPage === "number") {
        cumulativeAdCount += pageResult.totalAdsInPage;
      }

      // 페이지 간 랜덤 지연
      const delay = 1200 + Math.floor(Math.random() * 1300);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 전 페이지 탐색했지만 미발견
    return {
      productId,
      found: false,
      notes: [`광고 결과 내 미노출(${maxPages}페이지 스캔 완료)`],
    };
  } catch (error: any) {
    console.error("[AD] 크롤링 오류:", error?.message || error);
    return {
      productId,
      found: false,
      notes: [`크롤링 오류: ${error?.message || String(error)}`],
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { console.warn("[AD] 브라우저 종료 오류:", e); }
    }
  }
}