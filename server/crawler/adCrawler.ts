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

      // 현재 페이지 광고 스캔 (정확도 강화판 + 계산 로직 수정)
      const pageResult = await page.evaluate((targetId: string) => {
        function isAdBadge(el: Element): boolean {
          const sels = [
            'span[class*="ad"]','em[class*="ad"]','i[class*="ad"]',
            '[class*="sponsor"]','[data-ad*="true"]'
          ];
          for (const s of sels) {
            const n = el.querySelector(s);
            if (n && /\bAD\b|광고|스폰서/i.test((n.textContent||"").trim())) return true;
          }
          return /\bAD\b|광고|스폰서/i.test((el.textContent||"").trim());
        }
        function eqNum(a?: any,b?: any){ if(a==null||b==null) return false; return String(a).replace(/^0+/,'')===String(b).replace(/^0+/,''); }
        function abs(h:string){ try{ return new URL(h, location.origin).href; }catch{ return h; } }
        function extractIds(href:string){
          const ids:string[]=[]; const regs=[/[?&](nvMid)=(\d+)/i,/[?&](productId)=(\d+)/i,/[?&](prodNo)=(\d+)/i,/\/products\/(\d+)/i,/\/product\/(\d+)/i];
          for(const r of regs){ const m=href.match(r); if(m){ const v=m[m.length-1]; if(/^\d+$/.test(v)) ids.push(v);} }
          return ids;
        }
        // 메인 컨텐츠 영역으로 한정(사이드바/탑바 오검지 방지)
        const root = document.querySelector('#content') || document.body;
        const candidateSelectors = [
          "div[class*='basicList_item__']",
          "div[class*='product_item__']",
          ".list_basis li", ".list_basis > div",
          ".basicList_list_basis__uNBZC li", ".basicList_list_basis__uNBZC > div",
        ];
        let cards: Element[] = [];
        for (const sel of candidateSelectors) {
          const found = Array.from(root.querySelectorAll(sel));
          if (found.length) { cards = found; break; }
        }
        if (!cards.length) cards = Array.from(root.querySelectorAll("li, div"));

        // "상품형 광고"만: 광고뱃지 + 제품ID 링크 보유
        function isProductAdCard(el: Element): boolean {
          if (!isAdBadge(el)) return false;
          return Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]")).some(a => {
            const href = abs(a.getAttribute("href") || "");
            return /nvMid=|productId=|prodNo=|\/products\//i.test(href);
          });
        }
        const adCards = cards.filter(isProductAdCard);

        // 스토어 정보 + 가격 추출(폴백 추가)
        const storeDomainRe = /(smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com\/(partner|stores))/i;
        function extractStore(adEl: Element){
          let storeName: string | undefined, storeLink: string | undefined;
          const anchors = Array.from(adEl.querySelectorAll<HTMLAnchorElement>("a[href]"));
          // 1) 도메인 기반
          for (const a of anchors){
            const href = abs(a.getAttribute("href") || "");
            if (storeDomainRe.test(href)){ storeLink=href; const t=(a.textContent||a.getAttribute('aria-label')||a.getAttribute('title')||'').trim(); if(t) storeName=t; break; }
          }
          // 2) 클래스 기반
          if(!storeName){
            const n = adEl.querySelector("[class*='mall'],[class*='seller'],[data-nclick*='shop'],a[title]");
            if(n){
              const t=(n.textContent||n.getAttribute('aria-label')||n.getAttribute('title')||'').trim();
              if(t) storeName=t;
              if(!storeLink && (n as HTMLAnchorElement).href) storeLink=abs((n as HTMLAnchorElement).getAttribute('href')||'');
            }
          }
          // 3) 최후 폴백: 상품 앵커
          if(!storeLink){
            const a = anchors.find(a => /nvMid=|productId=|prodNo=|\/products\//i.test(abs(a.getAttribute("href")||"")));
            if(a) storeLink = abs(a.getAttribute("href")||'');
          }
          return { storeName, storeLink };
        }
        function extractPrice(adEl: Element){
          const sels = ["[class*='price'] [class*='num']","[class*='price_num']","[class*='price']","strong"];
          for(const s of sels){ const el=adEl.querySelector(s); const n=(el?.textContent||'').replace(/[^\d]/g,''); if(n) return Number(n); }
          return undefined;
        }

        let adRankInPage = 0;
        let hit: any = null;

        for (const ad of adCards){
          adRankInPage += 1;

          const idsInCard: string[] = [];
          for (const a of Array.from(ad.querySelectorAll<HTMLAnchorElement>("a[href]"))){
            extractIds(abs(a.getAttribute("href")||'')).forEach(v => idsInCard.push(v));
          }
          if (idsInCard.some(v => eqNum(v, targetId))){
            const { storeName, storeLink } = extractStore(ad);
            const price = extractPrice(ad);
            hit = { adRank: adRankInPage, storeName, storeLink, price };
            break;
          }
        }

        return { found: hit, totalAdsInPage: adCards.length };
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