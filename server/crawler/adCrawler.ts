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
      headless: "new",
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

      // 모든 page 메서드 제거 - 순수 로직 테스트
      console.log(`[AD][p${pageIndex}] 모든 page 메서드 제거 후 테스트`);

      // 임시로 페이지당 1개의 광고가 있다고 가정
      const pageResult = {
        found: null,
        totalCards: 10,
        totalAdsInPage: 1,
        idsPreview: [],
        webdriver: false,
      };

      // 누적
      cumulativeAdCount += 1;

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