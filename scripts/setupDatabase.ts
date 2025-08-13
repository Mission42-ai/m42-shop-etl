import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function setupDatabase() {
  const sql = postgres(process.env.DATABASE_URL!);
  
  try {
    console.log('🚀 Setting up database...');
    
    // 1. Enable pgvector extension
    console.log('📦 Enabling pgvector extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log('✅ pgvector extension enabled');
    
    // 2. Read migration file
    const migrationPath = path.join(process.cwd(), 'drizzle', '0000_premium_blue_marvel.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // 3. Split migration into individual statements
    const statements = migrationSQL
      .split('--> statement-breakpoint')
      .filter(stmt => stmt.trim().length > 0);
    
    console.log(`📝 Running ${statements.length} migration statements...`);
    
    // 4. Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        try {
          await sql.unsafe(statement);
          console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
        } catch (error: any) {
          if (error.message.includes('already exists')) {
            console.log(`⏭️ Statement ${i + 1}/${statements.length} skipped (already exists)`);
          } else {
            console.error(`❌ Statement ${i + 1} failed:`, error.message);
            throw error;
          }
        }
      }
    }
    
    // 5. Create vector index manually (since it's not in the migration)
    console.log('🔍 Creating vector index...');
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding 
        ON product_chunks 
        USING hnsw (embedding vector_cosine_ops)
      `;
      console.log('✅ Vector index created');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('⏭️ Vector index already exists');
      } else {
        console.log('⚠️ Vector index creation failed (might need manual creation):', error.message);
      }
    }
    
    // 6. Verify tables
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('shops', 'products', 'product_chunks', 'crawl_jobs', 'processing_queue')
    `;
    
    console.log('\n📊 Tables created:');
    tables.forEach(t => console.log(`  ✅ ${t.tablename}`));
    
    console.log('\n🎉 Database setup complete!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

setupDatabase();