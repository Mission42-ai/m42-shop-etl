import { firecrawl } from '../src/services/firecrawl.js';
import { processProduct } from '../src/services/productProcessor.js';
import { db, shops } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function testSingleProduct(productUrl: string) {
  try {
    console.log('🧪 Testing single product processing...');
    console.log('Product URL:', productUrl);
    
    // 1. Get or create shop
    const [shop] = await db
      .select()
      .from(shops)
      .where(eq(shops.baseUrl, 'https://www.everdrop.de'))
      .limit(1);
    
    if (!shop) {
      console.error('❌ Shop not found. Please run a crawl first.');
      return;
    }
    
    console.log('✅ Shop found:', shop.name);
    
    // 2. Scrape single product
    console.log('🔥 Scraping product page...');
    const scraped = await firecrawl.scrapeSingle(productUrl);
    
    console.log('📄 Scraped content length:', scraped.markdown.length);
    console.log('📋 Metadata:', scraped.metadata);
    
    // 3. Process the product
    console.log('🤖 Processing product...');
    const result = await processProduct({
      url: scraped.url,
      markdown: scraped.markdown,
      metadata: scraped.metadata,
      shopId: shop.id,
    });
    
    if (result.isNew) {
      console.log('✅ New product created:', result.product?.name);
    } else if (result.product) {
      console.log('✅ Product updated:', result.product.name);
    } else if (result.error) {
      console.error('❌ Error:', result.error);
    }
    
    // 4. Check database
    if (result.product) {
      console.log('\n📊 Product details:');
      console.log('  - ID:', result.product.id);
      console.log('  - Name:', result.product.name);
      console.log('  - Type:', result.product.productType);
      console.log('  - Price:', result.product.priceNumeric, result.product.currency);
      console.log('  - Category:', result.product.category);
      console.log('  - Tags:', result.product.tags);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Get product URL from command line
const productUrl = process.argv[2];

if (!productUrl) {
  console.log('Usage: tsx scripts/testSingleProduct.ts <product-url>');
  console.log('Example: tsx scripts/testSingleProduct.ts https://www.everdrop.de/products/delicates-detergent');
  process.exit(1);
}

testSingleProduct(productUrl);