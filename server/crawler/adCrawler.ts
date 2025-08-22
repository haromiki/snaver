import type { RankResult } from "@shared/schema";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerExtra from "puppeteer-extra";
import type { Browser } from "puppeteer";

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
  maxPages = 6,
  headful = false,            // 로컬 디버깅 시 true 추천
  proxy,                      // { server:"http://ip:port", username?:string, password?:string }
}: {
  keyword: string;
  productId: string; // nvMid / productId / prodNo / /products/{id} 모두 허용
  maxPages?: number;
  headful?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}): Promise<RankResult> {
  let browser: Browser | null = null;

  try {
    console.log("[AD] 브라우저 런칭 시작");
    
    // Stealth 플러그인 제거 - 기본 puppeteer만 사용
    const puppeteer = (await import("puppeteer")).default;

    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ];

    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
    });

    console.log("[AD] 브라우저 런칭 완료");
    const page = await browser.newPage();
    console.log("[AD] 새 페이지 생성 완료");

    // 프록시 인증
    if (proxy?.username && proxy?.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    // 기본 환경 스푸핑
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1364 + Math.floor(Math.random()*3), height: 768, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9" });
    await page.emulateTimezone("Asia/Seoul");

    // webdriver 흔적 추가 제거
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko"] });
      // plugins length > 0
      // @ts-ignore
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    console.log("[AD] 페이지 설정 완료");

    // 네트워크 스니핑 제거 - 순수 페이지 접근만

    let cumulativeAdCount = 0;

    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      const url =
        `https://search.shopping.naver.com/search/all?` +
        `query=${encodeURIComponent(keyword)}&` +
        `adQuery=${encodeURIComponent(keyword)}&` +
        `productSet=total&sort=rel&` +
        `pagingIndex=${pageIndex}&` +
        `pagingSize=${PAGE_SIZE}&` +
        `viewType=list`;

      console.log(`[AD] "${keyword}" p${pageIndex} → ${url}`);
      console.log(`[AD][p${pageIndex}] 페이지 접속 시작`);
      
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      console.log(`[AD][p${pageIndex}] 페이지 로딩 완료`);

      // 모든 page.evaluate와 page.waitForFunction 제거
      console.log(`[AD][p${pageIndex}] 모든 DOM 접근 메서드 제거 - 기본 지연만`);
      
      // 기본 지연만 유지
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log(`[AD][p${pageIndex}] 대기 완료`);

      // 실제 광고 스캔 로직 추가
      const pageResult = await page.evaluate((targetId: string) => {
        try {
          // 기본 카드 찾기
          const root = document.querySelector("#content") || document.body;
          const cards = Array.from(root.querySelectorAll("li, div")).filter(el => {
            const links = el.querySelectorAll("a[href]");
            return links.length > 0;
          });

          // 광고 카드 찾기 (텍스트 기반)
          const adCards = cards.filter(card => {
            const text = card.textContent || '';
            const hasAdText = /AD|광고|스폰서/i.test(text);
            const hasProductLink = Array.from(card.querySelectorAll("a[href]")).some(a => {
              const href = a.getAttribute("href") || '';
              return /nvMid=|productId=|prodNo=|\/products\/|\/product\//i.test(href);
            });
            return hasAdText && hasProductLink;
          });

          // 제품 ID 매칭 확인
          let found = null;
          let adRank = 0;
          
          for (const card of adCards) {
            adRank++;
            const links = Array.from(card.querySelectorAll("a[href]"));
            for (const link of links) {
              const href = link.getAttribute("href") || '';
              // ID 추출
              const idMatch = href.match(/(?:nvMid=|productId=|prodNo=|\/products\/|\/product\/)(\d+)/i);
              if (idMatch) {
                const extractedId = idMatch[1];
                if (extractedId === targetId) {
                  // 스토어명 찾기
                  const storeName = card.querySelector('[class*="mall"], [class*="seller"], [class*="store"]')?.textContent?.trim() || '';
                  // 가격 찾기
                  const priceElement = card.querySelector('[class*="price"]');
                  const priceText = priceElement?.textContent?.replace(/[^\d]/g, '') || '';
                  const price = priceText ? parseInt(priceText) : null;
                  
                  found = {
                    adRank,
                    storeName,
                    storeLink: href,
                    price
                  };
                  break;
                }
              }
            }
            if (found) break;
          }

          return {
            found,
            totalCards: cards.length,
            totalAdsInPage: adCards.length,
            anchorCount: document.querySelectorAll('a[href*="nvMid="],a[href*="productId="],a[href*="prodNo="]').length
          };
        } catch (e) {
          return {
            found: null,
            totalCards: 0,
            totalAdsInPage: 0,
            anchorCount: 0,
            error: e instanceof Error ? e.message : String(e)
          };
        }
      }, productId);

      console.log(`[AD][p${pageIndex}] cards=${pageResult.totalCards} adCards=${pageResult.totalAdsInPage} anchors=${pageResult.anchorCount}`);
      
      if (pageResult.error) {
        console.log(`[AD][p${pageIndex}] 스캔 에러: ${pageResult.error}`);
      }

      if (pageResult.found) {
        const r = pageResult.found;
        const globalRank = cumulativeAdCount + r.adRank;
        
        console.log(`[AD] 🎯 제품 발견! 페이지=${pageIndex} 순위=${r.adRank} 전체순위=${globalRank}`);
        
        return {
          productId,
          storeName: r.storeName,
          storeLink: r.storeLink,
          price: r.price ?? undefined,
          globalRank,
          page: pageIndex,
          rankInPage: r.adRank,
          found: true,
        };
      }

      // 누적
      cumulativeAdCount += pageResult.totalAdsInPage;

      // 페이지 간 지연
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.floor(Math.random() * 700)));
    }

    // 네트워크 스니핑 제거됨

    return {
      productId,
      found: false,
      notes: [`광고 결과 내 미노출(${maxPages}페이지 스캔 완료 또는 컨텐츠 미렌더)`],
    };
  } catch (err: any) {
    return { productId, found: false, notes: [`크롤링 오류: ${err?.message || String(err)}`] };
  } finally {
    try { await browser?.close(); } catch {}
  }
}