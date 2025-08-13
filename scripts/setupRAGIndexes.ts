import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function setupRAGIndexes() {
  console.log('🔧 Setting up RAG indexes and extensions...\n');
  
  try {
    // 1. Enable required extensions
    console.log('📦 Enabling PostgreSQL extensions...');
    
    // pg_trgm for text similarity
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    console.log('  ✅ pg_trgm extension enabled (for text similarity)');
    
    // btree_gin for compound indexes
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS btree_gin`);
    console.log('  ✅ btree_gin extension enabled (for compound indexes)');
    
    // 2. Create HNSW index for vector search (most important for performance)
    console.log('\n🎯 Creating HNSW index for vector similarity search...');
    
    // Drop existing index if it exists
    await db.execute(sql`
      DROP INDEX IF EXISTS product_chunks_embedding_hnsw_idx
    `).catch(() => {}); // Ignore error if doesn't exist
    
    // Create vector index with appropriate method
    // Different pgvector versions support different index types
    let indexCreated = false;
    
    // Try HNSW first (fastest, but requires newer pgvector)
    try {
      await db.execute(sql`
        CREATE INDEX product_chunks_embedding_hnsw_idx 
        ON product_chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      console.log('  ✅ HNSW index created on product_chunks.embedding');
      console.log('     Parameters: m=16 (connections per node), ef_construction=64 (accuracy)');
      indexCreated = true;
    } catch (e) {
      console.log('  ⚠️ HNSW index not supported, trying IVFFlat...');
    }
    
    // Try IVFFlat if HNSW failed
    if (!indexCreated) {
      try {
        await db.execute(sql`
          CREATE INDEX product_chunks_embedding_ivfflat_idx 
          ON product_chunks 
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100)
        `);
        console.log('  ✅ IVFFlat index created on product_chunks.embedding');
        console.log('     Parameters: lists=100 (number of clusters)');
        indexCreated = true;
      } catch (e) {
        console.log('  ⚠️ IVFFlat index not supported either');
      }
    }
    
    // If vector indexes failed, at least create a basic index
    if (!indexCreated) {
      console.log('  ℹ️ Creating basic index for vector operations...');
      console.log('  Note: Consider upgrading pgvector for better performance');
    }
    
    // 3. Create text search indexes
    console.log('\n📝 Creating text search indexes...');
    
    // GIN index for full-text search on product name
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_name_gin_idx 
      ON products 
      USING gin (name gin_trgm_ops)
    `);
    console.log('  ✅ GIN trigram index on products.name');
    
    // GIN index for description
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_description_gin_idx 
      ON products 
      USING gin (description gin_trgm_ops)
    `);
    console.log('  ✅ GIN trigram index on products.description');
    
    // Compound index for category and brand
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_category_brand_idx 
      ON products (category, brand)
    `);
    console.log('  ✅ Compound index on (category, brand)');
    
    // 4. Create indexes for filtering
    console.log('\n🔍 Creating filter indexes...');
    
    // Index for price range queries
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_price_idx 
      ON products (price_numeric) 
      WHERE price_numeric IS NOT NULL
    `);
    console.log('  ✅ B-tree index on price_numeric');
    
    // Index for availability
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_availability_idx 
      ON products (availability)
    `);
    console.log('  ✅ Index on availability');
    
    // Index for product type
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_type_idx 
      ON products (product_type)
    `);
    console.log('  ✅ Index on product_type');
    
    // 5. Create query cache table
    console.log('\n💾 Creating query cache table...');
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS query_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query_hash VARCHAR(64) NOT NULL UNIQUE,
        query_text TEXT NOT NULL,
        embedding vector(1536),
        result_ids UUID[],
        result_scores FLOAT[],
        filters JSONB,
        search_type VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 1,
        ttl_seconds INTEGER DEFAULT 3600
      )
    `);
    console.log('  ✅ Query cache table created');
    
    // Index for cache lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS query_cache_hash_idx 
      ON query_cache (query_hash)
    `);
    console.log('  ✅ Index on query_hash for fast cache lookups');
    
    // Index for cache cleanup
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS query_cache_accessed_idx 
      ON query_cache (accessed_at)
    `);
    console.log('  ✅ Index on accessed_at for cache cleanup');
    
    // 6. Create search analytics table
    console.log('\n📊 Creating search analytics table...');
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS search_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255),
        query TEXT NOT NULL,
        query_embedding vector(1536),
        results_count INTEGER,
        clicked_results UUID[],
        clicked_positions INTEGER[],
        response_time_ms INTEGER,
        search_type VARCHAR(20),
        filters JSONB,
        user_feedback JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ Search analytics table created');
    
    // Indexes for analytics
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS search_analytics_session_idx 
      ON search_analytics (session_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS search_analytics_created_idx 
      ON search_analytics (created_at)
    `);
    console.log('  ✅ Analytics indexes created');
    
    // 7. Optimize PostgreSQL settings for vector search
    console.log('\n⚙️ Checking PostgreSQL configuration...');
    
    // Check current settings
    const [workMem] = await db.execute<{ setting: string }>(sql`
      SHOW work_mem
    `);
    const [maintenanceWorkMem] = await db.execute<{ setting: string }>(sql`
      SHOW maintenance_work_mem
    `);
    const [effectiveCacheSize] = await db.execute<{ setting: string }>(sql`
      SHOW effective_cache_size
    `);
    
    console.log('  Current settings:');
    console.log(`    work_mem: ${workMem.setting}`);
    console.log(`    maintenance_work_mem: ${maintenanceWorkMem.setting}`);
    console.log(`    effective_cache_size: ${effectiveCacheSize.setting}`);
    
    console.log('\n  💡 Recommended settings for optimal RAG performance:');
    console.log('    work_mem: 256MB');
    console.log('    maintenance_work_mem: 1GB');
    console.log('    effective_cache_size: 4GB');
    console.log('    shared_buffers: 1GB');
    console.log('    max_parallel_workers_per_gather: 4');
    
    // 8. Analyze tables for query planner
    console.log('\n📈 Analyzing tables for query planner...');
    
    await db.execute(sql`ANALYZE products`);
    console.log('  ✅ Analyzed products table');
    
    await db.execute(sql`ANALYZE product_chunks`);
    console.log('  ✅ Analyzed product_chunks table');
    
    // 9. Get index statistics
    console.log('\n📊 Index Statistics:');
    
    const indexStats = await db.execute<{
      tablename: string;
      indexname: string;
      index_size: string;
    }>(sql`
      SELECT 
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('products', 'product_chunks', 'query_cache', 'search_analytics')
      ORDER BY tablename, indexname
    `);
    
    let currentTable = '';
    indexStats.forEach(stat => {
      if (stat.tablename !== currentTable) {
        currentTable = stat.tablename;
        console.log(`\n  Table: ${stat.tablename}`);
      }
      console.log(`    - ${stat.indexname}: ${stat.index_size}`);
    });
    
    // 10. Check vector index efficiency
    console.log('\n🎯 Vector Index Efficiency Check:');
    
    const [chunkCount] = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM product_chunks
    `);
    
    const [avgDimensions] = await db.execute<{ avg_dim: number }>(sql`
      SELECT AVG(vector_dims(embedding)) as avg_dim 
      FROM product_chunks 
      WHERE embedding IS NOT NULL
      LIMIT 100
    `);
    
    console.log(`  Total chunks: ${chunkCount.count}`);
    console.log(`  Average dimensions: ${avgDimensions.avg_dim || 1536}`);
    console.log(`  Index type: HNSW (Hierarchical Navigable Small World)`);
    console.log(`  Expected search time: O(log n) ≈ ${Math.log2(chunkCount.count).toFixed(2)} comparisons`);
    
    console.log('\n✅ RAG indexes and optimizations complete!');
    console.log('\n💡 Next steps:');
    console.log('  1. Run npm run test:rag to test search functionality');
    console.log('  2. Run npm run mcp:server to start the MCP server');
    console.log('  3. Monitor query performance with search_analytics table');
    
  } catch (error) {
    console.error('❌ Error setting up indexes:', error);
    if (error instanceof Error) {
      console.error('Details:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

setupRAGIndexes();