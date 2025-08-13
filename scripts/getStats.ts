import { db, products } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function getStats() {
  const stats = await db.select({
    totalProducts: sql`count(distinct ${products.id})`,
    unknownProducts: sql`count(distinct case when ${products.name} = 'Unknown Product' then ${products.id} end)`
  }).from(products);

  const total = Number(stats[0].totalProducts);
  const unknown = Number(stats[0].unknownProducts);
  const success = total - unknown;

  console.log('📊 Current Statistics:');
  console.log(`  Total Products: ${total}`);
  console.log(`  Successfully Extracted: ${success}`);
  console.log(`  Failed Extractions: ${unknown}`);
  console.log(`  Success Rate: ${(success / total * 100).toFixed(1)}%`);
  
  process.exit(0);
}

getStats();