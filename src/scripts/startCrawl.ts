import { db, shops, crawlJobs } from '../db/index.js';
import { firecrawl } from '../services/firecrawl.js';
import { serverConfig } from '../config/index.js';

interface StartCrawlOptions {
  shopName: string;
  baseUrl: string;
  includePaths: string[];
  excludePaths?: string[];
  limit?: number;
  maxDepth?: number;
  shopType?: string;
}

/**
 * Start a crawl job for a shop
 */
async function startShopCrawl(options: StartCrawlOptions) {
  try {
    console.log('🚀 Starting crawl job...');
    console.log('  Shop:', options.shopName);
    console.log('  Base URL:', options.baseUrl);
    console.log('  Include paths:', options.includePaths);
    console.log('  Exclude paths:', options.excludePaths || 'default');
    
    // 1. Create or update shop record
    const [shop] = await db
      .insert(shops)
      .values({
        name: options.shopName,
        baseUrl: options.baseUrl,
        shopType: options.shopType || null,
        crawlConfig: {
          includePaths: options.includePaths,
          excludePaths: options.excludePaths || ['/cart', '/checkout', '/account', '/login', '/register'],
          maxDepth: options.maxDepth || 3,
          limit: options.limit || 1000,
        },
      })
      .onConflictDoUpdate({
        target: shops.baseUrl,
        set: {
          name: options.shopName,
          shopType: options.shopType || null,
          crawlConfig: {
            includePaths: options.includePaths,
            excludePaths: options.excludePaths || ['/cart', '/checkout', '/account', '/login', '/register'],
            maxDepth: options.maxDepth || 3,
            limit: options.limit || 1000,
          },
          updatedAt: new Date(),
        },
      })
      .returning();
    
    console.log(`✅ Shop record created/updated: ${shop.id}`);
    
    // 2. Start Firecrawl job
    const webhookUrl = serverConfig.webhookUrl || `http://localhost:${serverConfig.port}/webhook/firecrawl`;
    
    const firecrawlJobId = await firecrawl.startCrawl({
      baseUrl: options.baseUrl,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths || ['/cart', '/checkout', '/account', '/login', '/register'],
      limit: options.limit || 1000,
      maxDepth: options.maxDepth || 3,
      webhookUrl: webhookUrl,
    });
    
    console.log(`✅ Firecrawl job started: ${firecrawlJobId}`);
    
    // 3. Create crawl job record
    const [crawlJob] = await db
      .insert(crawlJobs)
      .values({
        shopId: shop.id,
        firecrawlJobId: firecrawlJobId,
        status: 'running',
        config: {
          baseUrl: options.baseUrl,
          includePaths: options.includePaths,
          excludePaths: options.excludePaths,
          limit: options.limit,
          maxDepth: options.maxDepth,
          webhookUrl: webhookUrl,
        },
        startedAt: new Date(),
      })
      .returning();
    
    console.log(`✅ Crawl job tracked: ${crawlJob.id}`);
    console.log('');
    console.log('📊 Crawl job details:');
    console.log(`  - Shop ID: ${shop.id}`);
    console.log(`  - Crawl Job ID: ${crawlJob.id}`);
    console.log(`  - Firecrawl Job ID: ${firecrawlJobId}`);
    console.log(`  - Webhook URL: ${webhookUrl}`);
    console.log('');
    console.log('ℹ️ The crawl is now running. Products will be processed as they are discovered.');
    console.log('ℹ️ Check the webhook server logs for processing updates.');
    
    return {
      shopId: shop.id,
      crawlJobId: crawlJob.id,
      firecrawlJobId: firecrawlJobId,
    };
    
  } catch (error) {
    console.error('❌ Error starting crawl:', error);
    process.exit(1);
  }
}

/**
 * Main function - parse command line arguments and start crawl
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: npm run crawl <shop-name> <base-url> <include-path1> [include-path2] [...]');
    console.log('');
    console.log('Examples:');
    console.log('  npm run crawl example-shop https://example-shop.com /products /artikel');
    console.log('  npm run crawl furniture-store https://furniture.com /moebel /products /collections');
    console.log('');
    console.log('Options can be set via environment variables:');
    console.log('  CRAWL_LIMIT=500 - Maximum number of pages to crawl (default: 1000)');
    console.log('  CRAWL_DEPTH=2 - Maximum crawl depth (default: 3)');
    console.log('  SHOP_TYPE=fashion - Type of shop (fashion, furniture, electronics, etc.)');
    process.exit(1);
  }
  
  const shopName = args[0];
  const baseUrl = args[1];
  const includePaths = args.slice(2);
  
  // Get options from environment variables
  const limit = process.env.CRAWL_LIMIT ? parseInt(process.env.CRAWL_LIMIT) : 1000;
  const maxDepth = process.env.CRAWL_DEPTH ? parseInt(process.env.CRAWL_DEPTH) : 3;
  const shopType = process.env.SHOP_TYPE;
  
  // Start the crawl
  await startShopCrawl({
    shopName,
    baseUrl,
    includePaths,
    limit,
    maxDepth,
    shopType,
  });
  
  // Keep the process alive for a moment to ensure everything is saved
  setTimeout(() => {
    process.exit(0);
  }, 2000);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { startShopCrawl };