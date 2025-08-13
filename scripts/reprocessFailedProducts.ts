import { db, products } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import { reprocessProduct } from '../src/services/productProcessor.js';
import dotenv from 'dotenv';

dotenv.config();

async function reprocessFailedProducts() {
  try {
    console.log('\n🔄 Re-processing Failed Products\n');
    console.log('━'.repeat(80));
    
    // Get all failed products (Unknown Product)
    const failedProducts = await db.select({
      id: products.id,
      name: products.name,
      url: products.url,
      shopId: products.shopId,
      pageMarkdown: products.pageMarkdown
    })
    .from(products)
    .where(eq(products.name, 'Unknown Product'));
    
    console.log(`Found ${failedProducts.length} failed products to re-process\n`);
    
    if (failedProducts.length === 0) {
      console.log('✅ No failed products to re-process!');
      return;
    }
    
    const results = {
      success: [] as string[],
      failed: [] as string[],
    };
    
    // Re-process each failed product
    for (let i = 0; i < failedProducts.length; i++) {
      const product = failedProducts[i];
      console.log(`\n[${i + 1}/${failedProducts.length}] Re-processing: ${product.url}`);
      
      try {
        // Check if we have markdown content
        if (!product.pageMarkdown) {
          console.log('  ⚠️ No markdown content available, skipping...');
          results.failed.push(product.url);
          continue;
        }
        
        console.log(`  📄 Markdown available: ${product.pageMarkdown.length} chars`);
        
        // Re-process the product
        const result = await reprocessProduct(product.id);
        
        if (result.error) {
          console.log(`  ❌ Re-processing failed: ${result.error}`);
          results.failed.push(product.url);
        } else if (result.product) {
          console.log(`  ✅ Successfully re-processed: ${result.product.name}`);
          console.log(`     Price: €${result.product.priceNumeric || 'N/A'}`);
          console.log(`     Brand: ${result.product.brand || 'N/A'}`);
          console.log(`     Type: ${result.product.productType || 'N/A'}`);
          results.success.push(product.url);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`  ❌ Unexpected error:`, error);
        results.failed.push(product.url);
      }
    }
    
    // Print summary
    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 Re-processing Summary:\n');
    console.log(`  ✅ Successfully re-processed: ${results.success.length} products`);
    console.log(`  ❌ Failed to re-process: ${results.failed.length} products`);
    
    if (results.success.length > 0) {
      console.log('\n✅ Successfully re-processed products:');
      results.success.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Still failed products:');
      results.failed.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
    }
    
    // Get final statistics
    const stats = await db.select({
      totalProducts: db.fn.count(products.id),
      unknownProducts: db.fn.countDistinct(
        db.sql`CASE WHEN ${products.name} = 'Unknown Product' THEN ${products.id} END`
      )
    })
    .from(products);
    
    const totalProducts = Number(stats[0].totalProducts);
    const unknownProducts = Number(stats[0].unknownProducts);
    const successRate = ((totalProducts - unknownProducts) / totalProducts * 100).toFixed(1);
    
    console.log('\n' + '═'.repeat(80));
    console.log('\n📈 Final Database Statistics:');
    console.log(`  Total Products: ${totalProducts}`);
    console.log(`  Successfully Extracted: ${totalProducts - unknownProducts}`);
    console.log(`  Failed Extractions: ${unknownProducts}`);
    console.log(`  Success Rate: ${successRate}%`);
    
  } catch (error) {
    console.error('❌ Error in re-processing:', error);
  } finally {
    process.exit(0);
  }
}

reprocessFailedProducts();