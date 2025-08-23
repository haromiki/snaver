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
    console.log("[AD] 🚀 브라우저 런칭 시작");
    console.log("[AD] 🔧 Puppeteer 환경:", { headful, productId, keyword, maxPages });
    
    // PDF 개선: Stealth 플러그인 재활성화
    try {
      puppeteerExtra.use(StealthPlugin());
      console.log("[AD] ✅ Stealth 플러그인 활성화 완료");
    } catch (stealthErr: any) {
      console.log("[AD] ⚠️ Stealth 플러그인 실패:", stealthErr?.message);
    }
    
    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox", 
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-extensions",
      "--no-first-run",
      "--disable-default-apps"
    ];

    console.log("[AD] 🌐 브라우저 실행 시도 중...");
    try {
      browser = await puppeteerExtra.launch({
        headless: headful ? false : true,  // PDF 개선: headful 옵션에 따라 결정
        args: launchArgs,
      });
      console.log("[AD] ✅ 브라우저 런칭 성공");
    } catch (launchErr: any) {
      console.log("[AD] ❌ 브라우저 런칭 실패:", launchErr?.message);
      throw launchErr;
    }

    console.log("[AD] ✅ 브라우저 런칭 완료");
    
    let page;
    try {
      page = await browser.newPage();
      console.log("[AD] ✅ 새 페이지 생성 완료");
    } catch (pageErr: any) {
      console.log("[AD] ❌ 페이지 생성 실패:", pageErr?.message);
      throw pageErr;
    }

    // 프록시 인증
    if (proxy?.username && proxy?.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    // PDF 개선: 실제 사용자 환경과 동일한 설정
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.setViewport({ 
      width: 1920 + Math.floor(Math.random() * 100), 
      height: 1080 + Math.floor(Math.random() * 50), 
      deviceScaleFactor: 1 
    });
    await page.setExtraHTTPHeaders({ 
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "DNT": "1",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin"
    });
    await page.emulateTimezone("Asia/Seoul");

    // PDF 개선: Stealth 플러그인이 대부분 처리하므로 최소화
    await page.evaluateOnNewDocument(() => {
      // PDF 권장: 추가 webdriver 흔적 제거
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      delete (window as any).webdriver;
      
      // PDF 권장: 실제 브라우저처럼 객체 설정
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko", "en-US", "en"] });
      
      // 봇 탐지 방지를 위한 추가 설정
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
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
      
      // PDF 개선: networkidle2로 네트워크 안정까지 대기
      await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
      console.log(`[AD][p${pageIndex}] 페이지 로딩 완료`);

      // PDF 개선: 동적 콘텐츠 로드 대기 및 사용자 행동 시뮬레이션
      console.log(`[AD][p${pageIndex}] 동적 콘텐츠 로드 대기 시작`);
      
      try {
        // 1. 상품 카드가 나타날 때까지 대기 (최대 15초)
        await page.waitForSelector('a[href*="nvMid="], a[href*="productId="], a[href*="prodNo="]', { 
          timeout: 15000 
        });
        console.log(`[AD][p${pageIndex}] 상품 카드 로드 확인됨`);
      } catch (e) {
        console.log(`[AD][p${pageIndex}] 상품 카드 로드 대기 타임아웃 - 봇 차단 의심`);
      }
      
      // 2. PDF 권장: 자연스러운 스크롤로 지연 로딩 콘텐츠 활성화
      console.log(`[AD][p${pageIndex}] 사용자 행동 시뮬레이션 - 스크롤`);
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            
            if(totalHeight >= scrollHeight) {
              clearInterval(timer);
              // 스크롤을 맨 위로 다시 올림
              window.scrollTo(0, 0);
              resolve();
            }
          }, 200); // 200ms마다 스크롤
        });
      });
      
      // 3. PDF 권장: 랜덤 대기 (사용자가 페이지를 보는 시간)
      const humanDelay = 5000 + Math.floor(Math.random() * 10000); // 5-15초
      console.log(`[AD][p${pageIndex}] 사용자 행동 시뮬레이션 - ${humanDelay}ms 대기`);
      await new Promise(resolve => setTimeout(resolve, humanDelay));

      console.log(`[AD][p${pageIndex}] 동적 콘텐츠 로드 및 사용자 시뮬레이션 완료`);

      // 실제 광고 스캔 로직 추가
      const pageResult = await page.evaluate((targetId: string) => {
        try {
          // 기본 카드 찾기
          const root = document.querySelector("#content") || document.body;
          const cards = Array.from(root.querySelectorAll("li, div")).filter(el => {
            const links = el.querySelectorAll("a[href]");
            return links.length > 0;
          });

          // PDF 개선: 네이버 쇼핑 광고 구조에 최적화된 식별 로직
          const adCards = cards.filter(card => {
            const text = card.textContent || '';
            const innerHTML = card.innerHTML || '';
            
            // 1. 기본 텍스트 기반 광고 식별 (기존 방식 유지)
            const hasAdText = /AD|광고|스폰서/i.test(text);
            
            // 2. PDF 권장: DOM 구조 기반 광고 식별 보강
            const hasAdBadge = card.querySelector('[class*="ad"], [class*="sponsor"], [data-testid*="ad"]');
            const hasAdAttribute = card.hasAttribute('data-expose') && /advertisement/i.test(card.getAttribute('data-expose') || '');
            const hasAdClass = /ad|sponsor|promoted/i.test(card.className || '');
            
            // 3. PDF 권장: 네이버 쇼핑 특유의 광고 영역 구조 확인
            const isInAdSection = card.closest('[class*="ad"], [class*="sponsor"], [data-testid*="ad"]');
            
            // 4. 상품 링크 존재 여부 확인
            const hasProductLink = Array.from(card.querySelectorAll("a[href]")).some(a => {
              const href = a.getAttribute("href") || '';
              return /nvMid=|productId=|prodNo=|\/products\/|\/product\//i.test(href);
            });
            
            // PDF 권장: 여러 조건 중 하나라도 만족하면 광고로 판단
            const isAd = (hasAdText || hasAdBadge || hasAdAttribute || hasAdClass || isInAdSection) && hasProductLink;
            
            return isAd;
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
                  // PDF 개선: 더 정확한 스토어명 추출
                  let storeName = '';
                  const storeSelectors = [
                    '[class*="seller"]',
                    '[class*="mall"]', 
                    '[class*="store"]',
                    '[class*="shop"]',
                    '.productInfo__seller .seller_name',
                    '.product_mall',
                    '.basicList_mall__REzFA'
                  ];
                  
                  for (const selector of storeSelectors) {
                    const element = card.querySelector(selector);
                    if (element?.textContent?.trim()) {
                      storeName = element.textContent.trim();
                      break;
                    }
                  }
                  
                  // PDF 개선: 더 정확한 가격 추출
                  let price: number | null = null;
                  const priceSelectors = [
                    '[class*="price"]',
                    '.product_price',
                    '.basicList_price_area',
                    '.price_num'
                  ];
                  
                  for (const selector of priceSelectors) {
                    const element = card.querySelector(selector);
                    if (element?.textContent) {
                      const priceText = element.textContent.replace(/[^\d]/g, '');
                      if (priceText) {
                        price = parseInt(priceText);
                        break;
                      }
                    }
                  }
                  
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

      // PDF 개선: 사람처럼 느린 페이지 이동 (5-10초 랜덤)
      const pageDelay = 5000 + Math.floor(Math.random() * 5000); // 5-10초
      console.log(`[AD][p${pageIndex}] 다음 페이지로 이동 전 ${pageDelay}ms 대기`);
      await new Promise(resolve => setTimeout(resolve, pageDelay));
      
      // PDF 권장: CAPTCHA 또는 차단 페이지 감지
      const pageContent = await page.content();
      if (/보안을 위해 확인|captcha|blocked|차단/i.test(pageContent)) {
        console.log(`[AD][p${pageIndex}] ⚠️ 봇 차단/CAPTCHA 페이지 감지됨`);
        return {
          productId,
          found: false,
          notes: [`봇 차단 또는 CAPTCHA 페이지 감지됨 (페이지 ${pageIndex})`],
        };
      }
    }

    // 네트워크 스니핑 제거됨

    // PDF 개선: 최종 대체 시도 (브라우저 재시작)
    console.log(`[AD] 최종 시도: 새로운 브라우저로 다시 시도`);
    try {
      await browser?.close();
    } catch {}
    
    // 대체 시도: 단순한 방법으로 재시도
    try {
      const simpleBrowser = await puppeteerExtra.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      
      const simplePage = await simpleBrowser.newPage();
      await simplePage.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
      
      // 단순한 1페이지 시도
      const fallbackUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`;
      await simplePage.goto(fallbackUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const fallbackResult = await simplePage.evaluate((targetId: string) => {
        const anchors = document.querySelectorAll('a[href*="nvMid="], a[href*="productId="]');
        return { anchorCount: anchors.length };
      }, productId);
      
      await simpleBrowser.close();
      
      if (fallbackResult.anchorCount > 0) {
        return {
          productId,
          found: false,
          notes: [`봇 차단으로 인한 미노출 (상품 ${fallbackResult.anchorCount}개 감지됨, 광고 안보임)`],
        };
      } else {
        return {
          productId,
          found: false,
          notes: [`네이버 쇼핑 접근 또는 컨텐츠 로드 불가`],
        };
      }
    } catch (fallbackErr: any) {
      return {
        productId,
        found: false,
        notes: [`광고 결과 내 미노출(${maxPages}페이지 스캔 완료), 대체 시도 실패: ${fallbackErr?.message}`],
      };
    }
  } catch (err: any) {
    console.log("[AD] 💥 CRITICAL ERROR:", {
      message: err?.message,
      stack: err?.stack?.substring(0, 500),
      name: err?.name,
      code: err?.code
    });
    return { productId, found: false, notes: [`크롤링 오류: ${err?.message || String(err)}`] };
  } finally {
    try { 
      console.log("[AD] 🔄 브라우저 종료 중...");
      await browser?.close(); 
      console.log("[AD] ✅ 브라우저 종료 완료");
    } catch (closeErr: any) {
      console.log("[AD] ⚠️ 브라우저 종료 오류:", closeErr?.message);
    }
  }
}