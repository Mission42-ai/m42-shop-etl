import { db, products } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function analyzeFailures() {
  try {
    // Get all failed products (Unknown Product)
    const failedProducts = await db.select({
      id: products.id,
      name: products.name,
      url: products.url,
      extractedData: products.extractedData,
      pageMarkdown: products.pageMarkdown
    })
    .from(products)
    .where(eq(products.name, 'Unknown Product'));
    
    console.log(`\n❌ Failed Product Extractions: ${failedProducts.length}\n`);
    console.log('━'.repeat(80));
    
    failedProducts.forEach((p, idx) => {
      console.log(`${idx + 1}. URL: ${p.url}`);
      
      // Check if we have markdown content
      const hasMarkdown = p.pageMarkdown && p.pageMarkdown.length > 0;
      console.log(`   Has Markdown: ${hasMarkdown ? `Yes (${p.pageMarkdown?.length} chars)` : 'No'}`);
      
      // Check extraction error details
      if (p.extractedData) {
        console.log(`   Extracted Data:`, JSON.stringify(p.extractedData).substring(0, 200));
      } else {
        console.log(`   Extracted Data: None`);
      }
      
      // Try to find product name in markdown
      if (p.pageMarkdown) {
        const titleMatch = p.pageMarkdown.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          console.log(`   Found Title in Markdown: "${titleMatch[1]}"`);
        }
      }
      
      console.log('─'.repeat(80));
    });
    
    // Analyze one failed product in detail
    if (failedProducts.length > 0) {
      const sample = failedProducts[0];
      console.log('\n📋 Detailed Analysis of First Failure:');
      console.log('URL:', sample.url);
      
      if (sample.pageMarkdown) {
        console.log('\nFirst 1000 chars of markdown:');
        console.log(sample.pageMarkdown.substring(0, 1000));
        console.log('\n...');
      }
    }
    
  } catch (error) {
    console.error('❌ Error analyzing failures:', error);
  } finally {
    process.exit(0);
  }
}

analyzeFailures();