// 실제 네이버 쇼핑 웹사이트와 동일한 결과를 위한 Puppeteer 기반 일반 순위 추적
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { RankResult } from "@shared/schema";

// 스텔스 플러그인 적용 - 감지 회피
puppeteer.use(StealthPlugin());

const NAVER_SHOPPING_SEARCH_URL = "https://search.shopping.naver.com/search/all";

export async function fetchOrganicRankPuppeteer({
  keyword,
  productId,
  maxPages = 5, // 5페이지 = 200개 (40개/페이지)
}: {
  keyword: string;
  productId: string;
  maxPages?: number;
}): Promise<RankResult> {
  let browser = null;
  
  try {
    console.log(`🔍 일반 순위 검색 시작: ${keyword} (${productId})`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
      ],
    });

    const browserPage = await browser.newPage();
    
    // 브라우저 감지 회피
    await browserPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await browserPage.setViewport({ width: 1920, height: 1080 });
    
    // 모든 제품 수집
    const allProducts: any[] = [];
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(`📄 ${pageNum}페이지 크롤링 중...`);
      
      const url = `${NAVER_SHOPPING_SEARCH_URL}?query=${encodeURIComponent(keyword)}&pagingIndex=${pageNum}`;
      await browserPage.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // 페이지 로딩 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 일반 제품 목록 추출 (광고 제외)
      const pageProducts = await browserPage.evaluate(() => {
        // 일반 제품 카드 선택자 (광고 아닌 것들)
        const productCards = document.querySelectorAll('.product_list_item:not(.ad)');
        const products: any[] = [];
        
        productCards.forEach((card, index) => {
          try {
            // 제품 링크에서 productId 추출
            const linkElement = card.querySelector('a[href*="/products/"]');
            if (!linkElement) return;
            
            const href = linkElement.getAttribute('href') || '';
            const productIdMatch = href.match(/\/products\/(\d+)/);
            if (!productIdMatch) return;
            
            const productId = productIdMatch[1];
            
            // 상점명 추출
            const storeElement = card.querySelector('.product_mall_name');
            const storeName = storeElement?.textContent?.trim() || '';
            
            // 가격 추출
            const priceElement = card.querySelector('.price_num');
            const priceText = priceElement?.textContent?.replace(/[^\d]/g, '') || '0';
            const price = parseInt(priceText);
            
            // 제품명 추출
            const titleElement = card.querySelector('.product_title');
            const title = titleElement?.textContent?.trim() || '';
            
            products.push({
              productId,
              storeName,
              price,
              title,
              link: href.startsWith('http') ? href : `https://search.shopping.naver.com${href}`
            });
          } catch (error) {
            console.error('제품 정보 추출 실패:', error);
          }
        });
        
        return products;
      });
      
      allProducts.push(...pageProducts);
      
      console.log(`📄 ${pageNum}페이지: ${pageProducts.length}개 제품 수집`);
      
      // 페이지간 간격
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }
    
    console.log(`🎯 총 ${allProducts.length}개 제품 수집 완료`);
    
    // 타겟 제품 검색
    const targetIndex = allProducts.findIndex(
      (product) => String(product.productId) === String(productId)
    );
    
    if (targetIndex === -1) {
      return {
        productId,
        found: false,
        notes: [`상위 ${maxPages * 40}위 내 미노출`],
      };
    }
    
    const targetProduct = allProducts[targetIndex];
    const globalRank = targetIndex + 1;
    const pageNumber = Math.ceil(globalRank / 40);
    const rankInPage = ((globalRank - 1) % 40) + 1;
    
    console.log(`✅ 제품 발견! 순위: ${globalRank}위 (${pageNumber}페이지 ${rankInPage}번째)`);
    
    return {
      productId,
      storeName: targetProduct.storeName,
      storeLink: targetProduct.link,
      price: targetProduct.price,
      globalRank,
      page: pageNumber,
      rankInPage,
      found: true,
    };
    
  } catch (error: any) {
    console.error("Puppeteer 일반 순위 조회 오류:", error);
    
    return {
      productId,
      found: false,
      notes: [`크롤링 오류: ${error.message}`],
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}