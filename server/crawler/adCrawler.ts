// Puppeteer를 사용한 광고 순위 추적
import puppeteer from "puppeteer";
import type { RankResult } from "@shared/schema";

interface AdSearchResult {
  adRank: number;
  storeName?: string;
  storeLink?: string;
  price?: number;
}

function extractProductIdFromHref(href: string): string | null {
  // 네이버 쇼핑 상품 ID 추출 패턴들
  const patterns = [
    /(?:[?&])(nvMid|productId|prodNo)=(\d+)/i,
    /\/products\/(\d+)/i,
    /\/product\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = href.match(pattern);
    if (match) {
      return match[match.length - 1];
    }
  }
  return null;
}

export async function fetchAdRank({
  keyword,
  productId,
  maxPages = 10,
}: {
  keyword: string;
  productId: string;
  maxPages?: number;
}): Promise<RankResult> {
  let browser: any = null;

  try {
    // Puppeteer 브라우저 설정
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

    // PC 환경 시뮬레이션 (한국 사용자)
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9" });

    let cumulativeAdRank = 0;

    // 페이지별 순차 스캔
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      console.log(`[광고 랭킹] ${keyword} - 페이지 ${pageIndex} 스캔 중...`);

      const searchUrl =
        `https://search.shopping.naver.com/search/all?` +
        `adQuery=${encodeURIComponent(keyword)}&` +
        `pagingIndex=${pageIndex}&` +
        `pagingSize=40&` +
        `viewType=list`;

      await page.goto(searchUrl, { 
        waitUntil: "networkidle2", 
        timeout: 60000 
      });

      // 결과 컨테이너 대기
      try {
        await page.waitForSelector(".list_basis, .basicList_list_basis__uNBZC", { 
          timeout: 15000 
        });
      } catch {
        console.warn(`페이지 ${pageIndex}: 결과 컨테이너 찾을 수 없음`);
        continue;
      }

      // 자연스러운 스크롤 (감지 회피)
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let scrollHeight = 0;
          let step = 0;
          const maxSteps = 8;
          
          const scrollTimer = setInterval(() => {
            window.scrollBy(0, 400);
            scrollHeight += 400;
            step++;
            
            if (scrollHeight > 2000 || step > maxSteps) {
              clearInterval(scrollTimer);
              resolve();
            }
          }, 150);
        });
      });

      // 현재 페이지에서 광고 카드 스캔
      const pageResult = await page.evaluate((targetProductId: string) => {
        function isAdCard(element: Element): boolean {
          // 광고 라벨 텍스트 확인
          const adLabelSelectors = [
            'span[class*="ad"]',
            'em[class*="ad"]', 
            'i[class*="ad"]',
            '[class*="sponsor"]',
            '[data-ad*="true"]'
          ];

          for (const selector of adLabelSelectors) {
            const label = element.querySelector(selector);
            if (label) {
              const labelText = (label.textContent || "").trim();
              if (/\bAD\b|광고|스폰서/i.test(labelText)) {
                return true;
              }
            }
          }

          // 카드 전체 텍스트에서 광고 표시 확인
          const fullText = element.textContent || "";
          return /\bAD\b|광고|스폰서/i.test(fullText);
        }

        // 상품 카드들 찾기
        const cardSelectors = [
          ".list_basis li",
          ".list_basis > div",
          ".basicList_list_basis__uNBZC li",
          ".basicList_list_basis__uNBZC > div",
          "[class*='list__item']"
        ];

        let cards: Element[] = [];
        for (const selector of cardSelectors) {
          cards = Array.from(document.querySelectorAll(selector));
          if (cards.length > 0) break;
        }

        let adRankInPage = 0;
        
        for (const card of cards) {
          if (!isAdCard(card)) continue;

          adRankInPage++;

          // 카드 내 링크들에서 상품 ID 추출
          const links = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"));
          
          for (const link of links) {
            const href = link.getAttribute("href") || "";
            
            // 상품 ID 추출 시도
            const patterns = [
              /(?:[?&])(nvMid|productId|prodNo)=(\d+)/i,
              /\/products\/(\d+)/i,
              /\/product\/(\d+)/i,
            ];

            let extractedId: string | null = null;
            for (const pattern of patterns) {
              const match = href.match(pattern);
              if (match) {
                extractedId = match[match.length - 1];
                break;
              }
            }

            if (extractedId && String(extractedId) === String(targetProductId)) {
              // 매칭되는 상품 발견!
              const storeName = 
                (card.querySelector("[class*='mall']")?.textContent || "").trim() ||
                (card.querySelector("[data-nclick*='shop']")?.textContent || "").trim() ||
                undefined;

              const priceElement = card.querySelector("[class*='price']");
              const priceText = (priceElement?.textContent || "").replace(/[^\d]/g, "");
              const price = priceText ? Number(priceText) : undefined;

              return {
                adRank: adRankInPage,
                storeName,
                storeLink: link.href,
                price,
              };
            }
          }
        }

        // 이 페이지의 총 광고 개수 반환 (누적용)
        return {
          totalAdsInPage: adRankInPage,
          found: null,
        };

      }, productId);

      // 타겟 상품을 찾은 경우
      if (pageResult.found) {
        const result = pageResult.found as AdSearchResult;
        const globalAdRank = cumulativeAdRank + result.adRank;
        const page = Math.ceil(globalAdRank / 40);
        const rankInPage = ((globalAdRank - 1) % 40) + 1;

        return {
          productId,
          storeName: result.storeName,
          storeLink: result.storeLink,
          price: result.price,
          globalRank: globalAdRank,
          page,
          rankInPage,
          found: true,
        };
      }

      // 이 페이지의 광고 수를 누적
      if (typeof pageResult.totalAdsInPage === "number") {
        cumulativeAdRank += pageResult.totalAdsInPage;
      }

      // 랜덤 지연 (감지 회피)
      const delay = 1200 + Math.floor(Math.random() * 1300);
      await page.waitForTimeout(delay);
    }

    // 모든 페이지를 스캔했지만 찾지 못한 경우
    return {
      productId,
      found: false,
      notes: [`광고 결과 내 미노출(${maxPages}페이지 스캔 완료)`],
    };

  } catch (error: any) {
    console.error("광고 랭킹 조회 오류:", error);
    
    return {
      productId,
      found: false,
      notes: [`크롤링 오류: ${error.message}`],
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn("브라우저 종료 오류:", e);
      }
    }
  }
}