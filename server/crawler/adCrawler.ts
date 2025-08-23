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
        headless: false,  // 2025 최적화: 비헤드리스 모드로 탐지 회피
        args: [
          ...launchArgs,
          "--lang=ko-KR",
          "--accept-lang=ko-KR,ko;q=0.9,en;q=0.8",
          "--disable-features=VizDisplayCompositor",
          "--window-size=1920,1080"
        ],
        defaultViewport: null, // 실제 브라우저처럼
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

    // 2025 최적화: 완전한 한국 사용자 환경 시뮬레이션
    const koreanUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    await page.setUserAgent(koreanUserAgent);
    console.log("[AD] 🇰🇷 한국 사용자 환경 설정 완료");
    await page.setViewport({ 
      width: 1920 + Math.floor(Math.random() * 100), 
      height: 1080 + Math.floor(Math.random() * 50), 
      deviceScaleFactor: 1 
    });
    await page.setExtraHTTPHeaders({ 
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Cache-Control": "max-age=0",
      "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1"
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

    console.log("[AD] 🔧 페이지 설정 완료");

    // 2025 고급: 실제 한국인 사용자처럼 네이버 메인 페이지부터 시작
    console.log("[AD] 🏠 네이버 메인 페이지 방문 (자연스러운 탐색)");
    await page.goto("https://www.naver.com", { waitUntil: "networkidle0", timeout: 30000 });
    
    // 인간형 행동 1: 메인 페이지에서 잠깐 머물기
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
    
    // 인간형 행동 2: 실제 마우스 움직임과 클릭으로 쇼핑 탭 이동
    console.log("[AD] 🖱️ 자연스러운 마우스 움직임으로 쇼핑 탭 클릭");
    try {
      await page.hover('#gnb_mall');
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      await page.click('#gnb_mall', { delay: Math.random() * 100 });
      await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 });
    } catch (navError) {
      console.log("[AD] 🔄 직접 쇼핑 페이지로 이동");
      await page.goto("https://shopping.naver.com", { waitUntil: "networkidle0", timeout: 30000 });
    }
    
    // 인간형 행동 3: 쇼핑 메인 페이지에서 자연스럽게 둘러보기
    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
    
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

      console.log(`[AD] 📄 "${keyword}" 페이지 ${pageIndex}/${maxPages} 시작`);
      
      if (pageIndex === 1) {
        // 첫 번째 페이지: 실제 사람처럼 검색창에서 검색
        console.log(`[AD][p${pageIndex}] 🔍 검색창에 직접 키워드 입력`);
        
        try {
          // 검색창 찾고 클릭
          await page.waitForSelector('#__next input[placeholder*="검색"]', { timeout: 10000 });
          await page.click('#__next input[placeholder*="검색"]', { delay: Math.random() * 100 });
          
          // 인간형 타이핑: 한 글자씩 입력
          await page.keyboard.type(keyword, { delay: 100 + Math.random() * 200 });
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
          
          // 검색 버튼 클릭 또는 엔터
          await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
          
          console.log(`[AD][p${pageIndex}] ✅ 자연스러운 검색 완료`);
        } catch (searchError) {
          console.log(`[AD][p${pageIndex}] 🔄 검색 실패, 직접 URL 이동`);
          await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
        }
      } else {
        // 2페이지 이상: 페이지네이션 클릭 또는 URL 이동
        console.log(`[AD][p${pageIndex}] 🌐 ${pageIndex}페이지로 이동`);
        
        try {
          // 페이지 번호 클릭 시도
          const pageButton = await page.$(`a[href*="pagingIndex=${pageIndex}"]`);
          if (pageButton) {
            await page.hover(`a[href*="pagingIndex=${pageIndex}"]`);
            await page.click(`a[href*="pagingIndex=${pageIndex}"]`, { delay: Math.random() * 100 });
            await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
            console.log(`[AD][p${pageIndex}] ✅ 페이지 버튼 클릭 성공`);
          } else {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
            console.log(`[AD][p${pageIndex}] ✅ URL 직접 이동`);
          }
        } catch (navError) {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
          console.log(`[AD][p${pageIndex}] ⚠️ 페이지 이동 대체 완료`);
        }
      }

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
      console.log(`[AD][p${pageIndex}] 🔍 광고 제품 스캔 시작 (대상: ${productId})`);
      const pageResult = await page.evaluate((targetId: string) => {
        try {
          // 기본 카드 찾기
          const root = document.querySelector("#content") || document.body;
          const cards = Array.from(root.querySelectorAll("li, div")).filter(el => {
            const links = el.querySelectorAll("a[href]");
            return links.length > 0;
          });

          // 2025 완전히 새로운 네이버 광고 탐지 시스템
          console.log(`[광고탐지] 전체 ${cards.length}개 카드 분석 시작`);
          
          const adCards = [];
          let debugInfo = [];
          
          for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cardText = (card.textContent || '').trim();
            const cardHTML = card.innerHTML || '';
            const cardClass = card.className || '';
            
            let isAd = false;
            let reasons = [];
            
            // 방법 1: 명시적 광고 텍스트 (한글/영어)
            const adTexts = ['광고', 'AD', 'Sponsored', '후원', '프로모션', 'PROMOTION'];
            if (adTexts.some(text => cardText.includes(text))) {
              isAd = true;
              reasons.push('광고텍스트');
            }
            
            // 방법 2: CSS 클래스 패턴 분석
            const adClassPatterns = [/ad[_-]/, /sponsor/, /advertisement/, /promoted/, /banner/i];
            if (adClassPatterns.some(pattern => pattern.test(cardClass))) {
              isAd = true;
              reasons.push('CSS클래스');
            }
            
            // 방법 3: HTML 구조에서 광고 마커 찾기
            const adMarkers = [
              '[data-testid*="ad"]',
              '[data-nv-ad]', 
              '[class*="ad_"]',
              '.item_sponsor',
              '.sponsor_area',
              '[data-expose*="ad"]'
            ];
            
            if (adMarkers.some(marker => card.querySelector(marker))) {
              isAd = true;
              reasons.push('HTML마커');
            }
            
            // 방법 4: 위치 기반 (상위 결과는 광고일 가능성 높음)
            if (i < 5) {  // 상위 5개
              const hasProductLink = Array.from(card.querySelectorAll("a[href]")).some(a => {
                const href = a.getAttribute("href") || '';
                return /nvMid=|productId=|prodNo=|\/products\/|\/product\//i.test(href);
              });
              
              if (hasProductLink) {
                // 추가 광고 징후 확인
                const extraAdSigns = [
                  cardHTML.includes('data-cr='), // 클릭 추적
                  cardHTML.includes('nclick='),  // 네이버 클릭 추적
                  cardText.includes('무료배송'),
                  cardText.includes('할인'),
                  /[0-9]+%/.test(cardText), // 할인율
                ];
                
                if (extraAdSigns.filter(Boolean).length >= 2) {
                  isAd = true;
                  reasons.push('위치+징후');
                }
              }
            }
            
            // 방법 5: URL 패턴 (nv_ad, adcr 등)
            const cardLinks = Array.from(card.querySelectorAll("a[href]"));
            for (const link of cardLinks) {
              const href = link.getAttribute("href") || '';
              if (href.includes('nv_ad=') || href.includes('adcr=') || href.includes('AD_')) {
                isAd = true;
                reasons.push('광고URL');
                break;
              }
            }
            
            if (isAd) {
              adCards.push(card);
              debugInfo.push(`카드${i+1}: ${reasons.join(',')}`);
            }
          }
          
          console.log(`[광고탐지] 결과: ${adCards.length}개 광고 발견`, debugInfo.slice(0, 3));

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

      console.log(`[AD][p${pageIndex}] 📊 스캔 결과:`, {
        총카드: pageResult.totalCards,
        광고카드: pageResult.totalAdsInPage, 
        링크앵커: pageResult.anchorCount,
        에러: pageResult.error || "없음"
      });
      
      if (pageResult.error) {
        console.log(`[AD][p${pageIndex}] ❌ 스캔 에러: ${pageResult.error}`);
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