import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const CRAWL_PAGE_SIZE = parseInt(process.env.CRAWL_PAGE_SIZE) || 40;
const CRAWL_MAX_ITEMS = parseInt(process.env.CRAWL_MAX_ITEMS) || 200;

export async function crawlProduct(product) {
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await page.setViewport({ width: 1440, height: 900 });

    const wantAd = product.type === "ad";
    const maxPages = Math.ceil(CRAWL_MAX_ITEMS / CRAWL_PAGE_SIZE);
    
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(product.keyword)}&pagingIndex=${pageIndex}&pagingSize=${CRAWL_PAGE_SIZE}&sort=rel&viewType=list`;
      
      console.log(`Crawling page ${pageIndex}: ${url}`);
      
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      
      // Wait for products to load
      await page.waitForSelector(".product_list_item, .basicList_item__2X2kH", { timeout: 10000 }).catch(() => {});
      
      // Extract product data
      const results = await page.evaluate((targetProductNo, wantAd, pageIndex, pageSize) => {
        const items = document.querySelectorAll(".product_list_item, .basicList_item__2X2kH");
        const products = [];
        
        items.forEach((item, index) => {
          try {
            // Extract product link
            const linkElement = item.querySelector("a[href*='/products/'], a[href*='nv_mid='], a[href*='productId=']");
            if (!linkElement) return;
            
            const link = linkElement.href;
            
            // Extract product number from various sources
            let productNo = null;
            
            // Method 1: from /products/ URL
            const productsMatch = link.match(/\/products\/(\d+)/);
            if (productsMatch) {
              productNo = productsMatch[1];
            }
            
            // Method 2: from query parameters
            if (!productNo) {
              const url = new URL(link);
              productNo = url.searchParams.get("nv_mid") || 
                         url.searchParams.get("productId") ||
                         url.searchParams.get("nvMid");
            }
            
            if (!productNo) return;
            
            // Extract mall name
            const mallElement = item.querySelector(".product_mall, .mall_name, .price_mall__L7sjH");
            const mallName = mallElement ? mallElement.textContent.trim() : "";
            
            // Extract price
            const priceElement = item.querySelector(".price_num, .price_value, .price__H8hPa");
            let price = null;
            if (priceElement) {
              const priceText = priceElement.textContent.replace(/[^\d]/g, "");
              price = priceText ? parseInt(priceText) : null;
            }
            
            // Detect if it's an ad
            let isAd = false;
            const itemText = item.textContent;
            
            // Check for ad indicators in text
            if (itemText.includes("광고") || itemText.includes("AD") || itemText.includes("파워링크")) {
              isAd = true;
            }
            
            // Check for ad indicators in URL
            if (link.includes("ad_") || link.includes("acq") || link.includes("adQuery")) {
              isAd = true;
            }
            
            // Check for ad class names
            if (item.classList.contains("ad") || item.querySelector(".ad, .advertisement")) {
              isAd = true;
            }
            
            const rankOnPage = index + 1;
            const globalRank = (pageIndex - 1) * pageSize + rankOnPage;
            
            products.push({
              productNo,
              link,
              mallName,
              price,
              isAd,
              page: pageIndex,
              rankOnPage,
              globalRank,
            });
            
          } catch (error) {
            console.error("Error parsing product item:", error);
          }
        });
        
        // Find target product
        for (const product of products) {
          if (product.productNo === targetProductNo) {
            // Check if ad type matches what we want
            if ((wantAd && product.isAd) || (!wantAd && !product.isAd)) {
              return {
                found: true,
                page: product.page,
                rank_on_page: product.rankOnPage,
                global_rank: product.globalRank,
                price_krw: product.price,
                mall_name: product.mallName,
                product_link: product.link,
                is_ad: product.isAd,
              };
            }
          }
        }
        
        return { found: false };
        
      }, product.productNo, wantAd, pageIndex, CRAWL_PAGE_SIZE);
      
      if (results.found) {
        await browser.close();
        return results;
      }
    }
    
    await browser.close();
    return { notFound: true };
    
  } catch (error) {
    console.error("Crawler error:", error);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}
