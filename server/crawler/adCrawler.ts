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
  maxPages = 10,
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

      // 결과 컨테이너 대기(실패 허용)
      await page.waitForSelector(".list_basis, .basicList_list_basis__uNBZC", { timeout: 15_000 }).catch(() => {
        console.warn(`[AD] 페이지 ${pageIndex}: 결과 컨테이너 미검출`);
      });

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

      // 현재 페이지 광고 스캔 (완전 동작 복원)
      const pageResult = await page.evaluate((targetId) => {
        try {
          // 광고 배지 확인
          function isAdBadge(el) {
            const sels = ['span[class*="ad"]','em[class*="ad"]','i[class*="ad"]','[class*="sponsor"]'];
            for (let i = 0; i < sels.length; i++) {
              const n = el.querySelector(sels[i]);
              if (n && /AD|광고|스폰서/i.test(n.textContent || '')) return true;
            }
            return /AD|광고|스폰서/i.test(el.textContent || '');
          }
          
          // 숫자 비교
          function eqNum(a, b) {
            if (!a || !b) return false;
            return String(a).replace(/^0+/, '') === String(b).replace(/^0+/, '');
          }
          
          // 상품 ID 추출
          function extractIds(href) {
            const ids = [];
            const patterns = [/[?&]nvMid=(\d+)/i, /[?&]productId=(\d+)/i, /[?&]prodNo=(\d+)/i];
            for (let i = 0; i < patterns.length; i++) {
              const m = href.match(patterns[i]);
              if (m && m[1]) ids.push(m[1]);
            }
            return ids;
          }

          // 메인 컨텐츠에서 카드 찾기
          const root = document.querySelector('#content') || document.body;
          const selectors = ['.list_basis li', '.basicList_list_basis__uNBZC li', 'div[class*="item"]'];
          let cards = [];
          for (let i = 0; i < selectors.length; i++) {
            cards = Array.from(root.querySelectorAll(selectors[i]));
            if (cards.length) break;
          }

          // 상품형 광고만 필터
          const adCards = [];
          for (let i = 0; i < cards.length; i++) {
            const el = cards[i];
            if (!isAdBadge(el)) continue;
            const links = el.querySelectorAll('a[href]');
            let hasProductLink = false;
            for (let j = 0; j < links.length; j++) {
              if (/nvMid=|productId=|prodNo=/i.test(links[j].href || '')) {
                hasProductLink = true;
                break;
              }
            }
            if (hasProductLink) adCards.push(el);
          }

          let adRankInPage = 0;
          let hit = null;

          // 각 광고에서 상품 ID 매칭
          for (let i = 0; i < adCards.length; i++) {
            const ad = adCards[i];
            adRankInPage++;
            
            const idsInCard = [];
            const links = ad.querySelectorAll('a[href]');
            for (let j = 0; j < links.length; j++) {
              const href = links[j].getAttribute('href') || '';
              const ids = extractIds(href);
              for (let k = 0; k < ids.length; k++) {
                idsInCard.push(ids[k]);
              }
            }

            // 상품 ID 매칭 확인
            let matched = false;
            for (let j = 0; j < idsInCard.length; j++) {
              if (eqNum(idsInCard[j], targetId)) {
                matched = true;
                break;
              }
            }

            if (matched) {
              // 스토어명 추출
              let storeName = undefined;
              const nameEl = ad.querySelector('[class*="mall"], [class*="seller"]');
              if (nameEl && nameEl.textContent) {
                storeName = nameEl.textContent.trim();
              }

              // 스토어링크 및 가격 추출  
              let storeLink = undefined;
              let price = undefined;
              
              if (links.length > 0) {
                storeLink = links[0].getAttribute('href') || '';
              }
              
              const priceEl = ad.querySelector('[class*="price"]');
              if (priceEl && priceEl.textContent) {
                const priceText = priceEl.textContent.replace(/[^\d]/g, '');
                if (priceText) price = Number(priceText);
              }

              hit = { adRank: adRankInPage, storeName: storeName, storeLink: storeLink, price: price };
              break;
            }
          }

          return { found: hit, totalAdsInPage: adCards.length };
        } catch(e) {
          return { found: null, totalAdsInPage: 0, error: e.message };
        }
      }, productId);

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