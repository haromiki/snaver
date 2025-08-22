// Puppeteer를 사용한 광고 순위 추적 — 확정본 (라벨/ID/대기/디버그 강화)
import puppeteer from "puppeteer";
import type { RankResult } from "@shared/schema";

type AdSearchResult = {
  adRank: number;       // 페이지 내 광고 순번(1-based)
  storeName?: string;
  storeLink?: string;
  price?: number;
};

const PAGE_SIZE = 40;

// 숫자문자열 동일성(선행 0 제거)
function eqNumStr(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || b == null) return false;
  const sa = String(a).replace(/^0+/, "");
  const sb = String(b).replace(/^0+/, "");
  return sa === sb;
}

export async function fetchAdRank({
  keyword,
  productId,
  maxPages = 6, // 4페이지 이상 필요하므로 기본 6으로
}: {
  keyword: string;
  productId: string; // nvMid / productId / prodNo / products/{id} 모두 허용
  maxPages?: number;
}): Promise<RankResult> {
  let browser: puppeteer.Browser | null = null;

  try {
    console.log("[AD] 브라우저 런칭 시작");
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
    console.log("[AD] 브라우저 런칭 완료");

    console.log("[AD] 새 페이지 생성 시작");
    const page = await browser.newPage();
    console.log("[AD] 새 페이지 생성 완료");

    console.log("[AD] 페이지 설정 시작");
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9" });
    console.log("[AD] 페이지 설정 완료");

    let cumulativeAdCount = 0;

    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      try {
        const searchUrl =
          `https://search.shopping.naver.com/search/all?` +
          `query=${encodeURIComponent(keyword)}&` +
          `adQuery=${encodeURIComponent(keyword)}&` +
          `productSet=total&sort=rel&` +
          `pagingIndex=${pageIndex}&` +
          `pagingSize=${PAGE_SIZE}&` +
          `viewType=list`;

        console.log(`[AD] "${keyword}" p${pageIndex} → ${searchUrl}`);
        console.log(`[AD][p${pageIndex}] 페이지 접속 시작`);

        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60_000 });
        console.log(`[AD][p${pageIndex}] 페이지 로딩 완료`);

        await new Promise(r => setTimeout(r, 2000));
        console.log(`[AD][p${pageIndex}] 대기 완료`);

        // 실제 광고 스캔
        const pageResult = await page.evaluate((targetId) => {
          // 기본 카드 찾기
          const root = document.querySelector("#content") || document.body;
          const cards = Array.from(root.querySelectorAll("li, div")).filter(el => {
            const links = el.querySelectorAll("a[href]");
            return links.length > 0;
          });

          // 광고 카드 찾기
          const adCards = cards.filter(card => {
            const text = card.textContent || '';
            const hasAdText = /AD|광고|스폰서/i.test(text);
            const hasProductLink = Array.from(card.querySelectorAll("a[href]")).some(a => {
              const href = a.getAttribute("href") || '';
              return /nvMid=|productId=|prodNo=|\/products\/|\/product\//i.test(href);
            });
            return hasAdText && hasProductLink;
          });

          return {
            found: null,
            totalCards: cards.length,
            totalAdsInPage: adCards.length,
            idsPreview: []
          };
        }, productId);

        console.log(`[AD][p${pageIndex}] cards=${pageResult.totalCards} adCards=${pageResult.totalAdsInPage}`);

        // 누적 후 다음 페이지로
        if (typeof pageResult?.totalAdsInPage === "number") {
          cumulativeAdCount += pageResult.totalAdsInPage;
        }

      } catch (pageError: any) {
        console.error(`[AD][p${pageIndex}] 페이지 에러:`, pageError?.message || pageError);
        throw pageError;
      }
    }

    // 미발견
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