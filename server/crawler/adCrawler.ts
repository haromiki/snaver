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
        `adQuery=${encodeURIComponent(keyword)}&` +
        `pagingIndex=${pageIndex}&` +
        `pagingSize=${PAGE_SIZE}&` +
        `viewType=list`;

      console.log(`[AD] "${keyword}" 페이지 ${pageIndex} 요청: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60_000 });

      // 결과 컨테이너 대기(실패 허용)
      await page.waitForSelector(".list_basis, .basicList_list_basis__uNBZC", { timeout: 15_000 }).catch(() => {
        console.warn(`[AD] 페이지 ${pageIndex}: 결과 컨테이너 미검출`);
      });

      // 자연 스크롤 (탐지 회피 및 지연)
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let h = 0, step = 0;
          const timer = setInterval(() => {
            window.scrollBy(0, 400);
            h += 400;
            step++;
            if (h > 2000 || step > 8) { clearInterval(timer); resolve(); }
          }, 150);
        });
      });

      // 현재 페이지 광고 스캔
      const pageResult = await page.evaluate((targetId: string, PAGE_SIZE_IN: number) => {
        // 내부 헬퍼: 광고 라벨/텍스트 판정
        function isAdCard(el: Element): boolean {
          const labelSel = [
            'span[class*="ad"]',
            'em[class*="ad"]',
            'i[class*="ad"]',
            '[class*="sponsor"]',
            '[data-ad*="true"]',
          ];
          for (const s of labelSel) {
            const label = el.querySelector(s);
            if (label) {
              const t = (label.textContent || "").trim();
              if (/\bAD\b|광고|스폰서/i.test(t)) return true;
            }
          }
          const txt = (el.textContent || "").trim();
          return /\bAD\b|광고|스폰서/i.test(txt);
        }

        // 내부 헬퍼: 숫자문자열 동등 비교
        function eqNumStrInner(a?: string | number | null, b?: string | number | null): boolean {
          if (a == null || b == null) return false;
          const sa = String(a).replace(/^0+/, "");
          const sb = String(b).replace(/^0+/, "");
          return sa === sb;
        }

        // 내부 헬퍼: href에서 가능한 상품ID들 추출
        function extractIds(href: string): string[] {
          const ids: string[] = [];
          const regs = [
            /[?&](nvMid)=(\d+)/i,
            /[?&](productId)=(\d+)/i,
            /[?&](prodNo)=(\d+)/i,
            /\/products\/(\d+)/i,
            /\/product\/(\d+)/i,
          ];
          for (const r of regs) {
            const m = href.match(r);
            if (m) {
              const val = m[m.length - 1];
              if (val && /^\d+$/.test(val)) ids.push(val);
            }
          }
          return ids;
        }

        // 카드 후보 선택(레이아웃 변경 내성)
        const cardSelectors = [
          ".list_basis li",
          ".list_basis > div",
          ".basicList_list_basis__uNBZC li",
          ".basicList_list_basis__uNBZC > div",
          "[class*='list__item']",
        ];
        let cards: Element[] = [];
        for (const selector of cardSelectors) {
          const found = Array.from(document.querySelectorAll(selector));
          if (found.length) { cards = found; break; }
        }
        if (!cards.length) cards = Array.from(document.querySelectorAll("li, div"));

        // 광고 카드만 필터링
        const adCards = cards.filter(isAdCard);

        let adRankInPage = 0;
        let hit: AdSearchResult | null = null;

        for (const ad of adCards) {
          adRankInPage += 1;

          const anchors = Array.from(ad.querySelectorAll<HTMLAnchorElement>("a[href]"));
          let matched = false;
          let storeName: string | undefined;
          let storeLink: string | undefined;
          let price: number | undefined;

          for (const a of anchors) {
            const rawHref = a.getAttribute("href") || "";
            let absHref = rawHref;
            try { absHref = new URL(rawHref, location.origin).href; } catch {}

            const ids = extractIds(absHref);
            if (ids.some((x) => eqNumStrInner(x, targetId))) {
              matched = true;
              storeLink = absHref;

              const nameEl =
                ad.querySelector("[class*='mall']") ||
                ad.querySelector("[class*='seller']") ||
                ad.querySelector("[data-nclick*='shop']") ||
                ad.querySelector("a[title]");
              storeName = (nameEl?.textContent || "").trim() || undefined;

              const priceEl =
                ad.querySelector("[class*='price'] [class*='num']") ||
                ad.querySelector("[class*='price']") ||
                ad.querySelector("strong");
              const priceTxt = (priceEl?.textContent || "").replace(/[^\d]/g, "");
              if (priceTxt) price = Number(priceTxt);

              break;
            }
          }

          if (matched) {
            hit = { adRank: adRankInPage, storeName, storeLink, price };
            break;
          }
        }

        return {
          found: hit,                  // ★ 항상 동일 키로 반환
          totalAdsInPage: adCards.length, // ★ 페이지 내 광고 총량
          pageSize: PAGE_SIZE_IN,      // 디버깅용
        };
      }, productId, PAGE_SIZE);

      // 발견 시 전역 순번 환산 후 즉시 반환
      if (pageResult?.found) {
        const r = pageResult.found as AdSearchResult;
        const globalRank = cumulativeAdCount + r.adRank;
        const pageNo = Math.ceil(globalRank / PAGE_SIZE);
        const rankInPage = ((globalRank - 1) % PAGE_SIZE) + 1;

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
      await page.waitForTimeout(delay);
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