import cron from "node-cron";
import { storage } from "../storage.js";
import { crawlProduct } from "../crawler/shoppingCrawler.js";

let isRunning = false;

// Run every minute
cron.schedule("* * * * *", async () => {
  if (isRunning) {
    console.log("Scheduler already running, skipping...");
    return;
  }
  
  isRunning = true;
  
  try {
    const now = new Date();
    const currentMinute = now.getMinutes();
    
    console.log(`Scheduler tick: ${now.toISOString()}`);
    
    // Get all active products
    const allProducts = await storage.getProducts(0, { active: true }); // TODO: Fix this to get all users' products
    
    for (const product of allProducts) {
      try {
        // Check if it's time to crawl this product
        if (currentMinute % product.intervalMin === 0) {
          console.log(`Crawling product ${product.id}: ${product.keyword}`);
          
          const result = await crawlProduct(product);
          
          // Save track result
          await storage.createTrack({
            productId: product.id,
            isAd: result.notFound ? false : result.is_ad,
            page: result.notFound ? null : result.page,
            rankOnPage: result.notFound ? null : result.rank_on_page,
            globalRank: result.notFound ? null : result.global_rank,
            priceKrw: result.notFound ? null : result.price_krw,
            mallName: result.notFound ? null : result.mall_name,
            productLink: result.notFound ? null : result.product_link,
          });
          
          console.log(`Saved track for product ${product.id}: ${result.notFound ? "Not found" : `Rank ${result.global_rank}`}`);
        }
      } catch (error) {
        console.error(`Error crawling product ${product.id}:`, error);
        // Continue with other products
      }
    }
    
  } catch (error) {
    console.error("Scheduler error:", error);
  } finally {
    isRunning = false;
  }
});

console.log("Scheduler started - will run every minute");
