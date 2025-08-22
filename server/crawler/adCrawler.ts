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

      // 현재 페이지 광고 스캔 (정확도 강화판)
      const pageResult = await page.evaluate((targetId: string, PAGE_SIZE_IN: number) => {
        // 1) 광고 라벨 텍스트 확인
        function isAdBadge(el: Element): boolean {
          const labelSel = [
            'span[class*="ad"]',
            'em[class*="ad"]',
            'i[class*="ad"]',
            '[class*="sponsor"]',
            '[data-ad*="true"]',
          ];
          for (const s of labelSel) {
            const n = el.querySelector(s);
            if (n) {
              const t = (n.textContent || "").trim();
              if (/\bAD\b|광고|스폰서/i.test(t)) return true;
            }
          }
          // 라벨이 따로 없으면 카드 전체 텍스트로 보조 판정
          const txt = (el.textContent || "").trim();
          return /\bAD\b|광고|스폰서/i.test(txt);
        }

        // 2) 숫자문자열 비교 유틸
        function eqNumStrInner(a?: string | number | null, b?: string | number | null): boolean {
          if (a == null || b == null) return false;
          const sa = String(a).replace(/^0+/, "");
          const sb = String(b).replace(/^0+/, "");
          return sa === sb;
        }

        // 3) href에서 가능한 상품ID들 추출
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

        // 4) 상대링크 → 절대링크
        function abs(href: string): string {
          try { return new URL(href, location.origin).href; } catch { return href; }
        }

        // 5) "상품형 광고 카드" 판정: 광고 뱃지 + 상품ID 링크 보유
        function isProductAdCard(el: Element): boolean {
          if (!isAdBadge(el)) return false;
          const aTags = Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"));
          return aTags.some(a => {
            const href = abs(a.getAttribute("href") || "");
            return /nvMid=|productId=|prodNo=|\/products\//i.test(href);
          });
        }

        // 6) 후보 카드 수집 (레이아웃 내성)
        const cardSelectors = [
          "div[class*='basicList_item__']",   // 리스트형
          "div[class*='product_item__']",     // 카드형
          ".list_basis li",
          ".list_basis > div",
          ".basicList_list_basis__uNBZC li",
          ".basicList_list_basis__uNBZC > div",
        ];
        let cards: Element[] = [];
        for (const sel of cardSelectors) {
          const found = Array.from(document.querySelectorAll(sel));
          if (found.length) { cards = found; break; }
        }
        if (!cards.length) cards = Array.from(document.querySelectorAll("li, div"));

        // 7) "상품형 광고 카드"만 필터
        const adCards = cards.filter(isProductAdCard);

        // 8) 스토어명/링크 추출 로직
        const storeLinkDomainRe = /(smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com\/partner|shopping\.naver\.com\/stores)/i;
        function extractStoreInfo(adEl: Element) {
          // 우선 스토어 앵커 우선 탐색
          const aTags = Array.from(adEl.querySelectorAll<HTMLAnchorElement>("a[href]"));
          let storeName: string | undefined;
          let storeLink: string | undefined;

          // 8-1) 도메인 기반 스토어 앵커
          for (const a of aTags) {
            const href = abs(a.getAttribute("href") || "");
            if (storeLinkDomainRe.test(href)) {
              storeLink = href;
              const txt = (a.textContent || "").trim();
              if (txt) storeName = txt;
              break;
            }
          }

          // 8-2) 클래스/데이터 기반 후보 (UI 클래스 변화 대응)
          if (!storeName) {
            const nameEl =
              adEl.querySelector("[class*='mall']") ||
              adEl.querySelector("[class*='seller']") ||
              adEl.querySelector("[data-nclick*='shop']") ||
              adEl.querySelector("a[title]");
            const txt = (nameEl?.textContent || "").trim();
            if (txt) storeName = txt;
            if (!storeLink && nameEl instanceof HTMLAnchorElement) {
              storeLink = abs(nameEl.getAttribute("href") || "");
            }
          }

          // 8-3) 둘 다 못 얻으면, 최후 폴백: 첫 상품 앵커 링크를 storeLink로
          if (!storeLink) {
            for (const a of aTags) {
              const href = abs(a.getAttribute("href") || "");
              if (/nvMid=|productId=|prodNo=|\/products\//i.test(href)) {
                storeLink = href;
                break;
              }
            }
          }

          return { storeName, storeLink };
        }

        // 9) 가격 추출 (내성 강화)
        function extractPrice(adEl: Element): number | undefined {
          const candidates = [
            "[class*='price'] [class*='num']",
            "[class*='price_num']",
            "[class*='price']",
            "strong",
          ];
          for (const sel of candidates) {
            const el = adEl.querySelector(sel);
            const txt = (el?.textContent || "").replace(/[^\d]/g, "");
            if (txt) return Number(txt);
          }
          return undefined;
        }

        // 10) 페이지 내 랭킹 계산 및 타겟 매칭
        let adRankInPage = 0;
        let hit: AdSearchResult | null = null;

        for (const ad of adCards) {
          adRankInPage += 1;

          // 이 카드가 가진 모든 상품ID 후보
          const idsInCard: string[] = [];
          const anchors = Array.from(ad.querySelectorAll<HTMLAnchorElement>("a[href]"));
          for (const a of anchors) {
            const href = abs(a.getAttribute("href") || "");
            const ids = extractIds(href);
            if (ids.length) idsInCard.push(...ids);
          }

          // 타겟 매칭
          const matched = idsInCard.some((x) => eqNumStrInner(x, targetId));
          if (matched) {
            const { storeName, storeLink } = extractStoreInfo(ad);
            const price = extractPrice(ad);
            hit = { adRank: adRankInPage, storeName, storeLink, price };
            break;
          }
        }

        // adCards.length 대신 "상품형 광고 카드 수"로 누적 (정확도 개선)
        return {
          found: hit,
          totalAdsInPage: adCards.length,
          pageSize: PAGE_SIZE_IN,
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