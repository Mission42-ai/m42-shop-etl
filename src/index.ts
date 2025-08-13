/**
 * M42 Shop ETL - Main Entry Point
 * 
 * This file serves as the main entry point for the ETL pipeline.
 * It can be used to start the webhook server or run one-off commands.
 */

import { checkDatabaseConnection } from './db/index.js';
import { config } from './config/index.js';

async function main() {
  console.log('🚀 M42 Shop ETL Pipeline');
  console.log('========================');
  console.log('');
  
  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  
  if (!dbConnected) {
    console.error('❌ Failed to connect to database');
    console.error('Please check your DATABASE_URL in .env');
    process.exit(1);
  }
  
  console.log('✅ All systems ready');
  console.log('');
  console.log('Available commands:');
  console.log('  npm run webhook    - Start webhook server');
  console.log('  npm run crawl      - Start a crawl job');
  console.log('  npm run db:push    - Push database schema');
  console.log('  npm run db:studio  - Open Drizzle Studio');
  console.log('');
  console.log('Environment:');
  console.log(`  NODE_ENV: ${config.NODE_ENV}`);
  console.log(`  LLM Model: ${config.LLM_MODEL}`);
  console.log(`  Embedding Model: ${config.EMBED_MODEL}`);
  console.log(`  Embedding Dimensions: ${config.EMBED_DIM}`);
}

main().catch(console.error);