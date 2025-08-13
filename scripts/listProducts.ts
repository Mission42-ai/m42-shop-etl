import { db, products } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function listProducts() {
  try {
    // Get all products with names (exclude Unknown Product)
    const productList = await db.select({
      name: products.name,
      productType: products.productType,
      price: products.priceNumeric,
      brand: products.brand,
      category: products.category,
      availability: products.availability,
      url: products.url
    })
    .from(products)
    .where(sql`${products.name} != 'Unknown Product'`)
    .orderBy(products.name);
    
    console.log(`\n📊 Successfully Extracted Products: ${productList.length}\n`);
    console.log('━'.repeat(80));
    
    productList.forEach((p, idx) => {
      console.log(`${idx + 1}. ${p.name}`);
      console.log(`   Type: ${p.productType || 'N/A'} | Price: €${p.price || 'N/A'} | Brand: ${p.brand || 'N/A'}`);
      console.log(`   Category: ${p.category || 'N/A'} | Availability: ${p.availability || 'N/A'}`);
      console.log(`   URL: ${p.url}`);
      console.log('─'.repeat(80));
    });
    
    // Get statistics
    const stats = await db.select({
      totalProducts: sql<number>`count(distinct ${products.id})`,
      productsWithPrice: sql<number>`count(distinct case when ${products.priceNumeric} is not null then ${products.id} end)`,
      productsWithBrand: sql<number>`count(distinct case when ${products.brand} is not null then ${products.id} end)`,
      unknownProducts: sql<number>`count(distinct case when ${products.name} = 'Unknown Product' then ${products.id} end)`
    })
    .from(products);
    
    console.log('\n📈 Statistics:');
    console.log(`  Total Products: ${stats[0].totalProducts}`);
    console.log(`  Successfully Extracted: ${stats[0].totalProducts - stats[0].unknownProducts}`);
    console.log(`  Failed Extractions: ${stats[0].unknownProducts}`);
    console.log(`  Products with Price: ${stats[0].productsWithPrice}`);
    console.log(`  Products with Brand: ${stats[0].productsWithBrand}`);
    
  } catch (error) {
    console.error('❌ Error listing products:', error);
  } finally {
    process.exit(0);
  }
}

listProducts();