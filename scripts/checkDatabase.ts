import { db, products, productChunks, shops } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  try {
    // Check products
    const productCount = await db.select({ count: sql<number>`count(*)` })
      .from(products);
    console.log(`\n📊 Database Status:`);
    console.log(`  Products: ${productCount[0].count}`);
    
    // Get sample products
    const sampleProducts = await db.select({
      id: products.id,
      name: products.name,
      productType: products.productType,
      price: products.priceNumeric,
      brand: products.brand,
      url: products.url
    })
    .from(products)
    .limit(5);
    
    if (sampleProducts.length > 0) {
      console.log(`\n🛍️ Sample Products:`);
      sampleProducts.forEach(p => {
        console.log(`  - ${p.name}`);
        console.log(`    Type: ${p.productType}, Price: ${p.price}, Brand: ${p.brand}`);
        console.log(`    URL: ${p.url}`);
      });
    }
    
    // Check chunks
    const chunkCount = await db.select({ count: sql<number>`count(*)` })
      .from(productChunks);
    console.log(`\n  Product Chunks: ${chunkCount[0].count}`);
    
    // Check shops
    const shopList = await db.select().from(shops);
    console.log(`\n🏪 Shops:`);
    shopList.forEach(s => {
      console.log(`  - ${s.name} (${s.shopType}): ${s.baseUrl}`);
    });
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    process.exit(0);
  }
}

checkDatabase();