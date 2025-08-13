import { vectorSearch, hybridSearch } from '../src/rag/vectorSearch.js';
import dotenv from 'dotenv';

dotenv.config();

async function testRAGSearch() {
  console.log('🧪 Testing RAG Search Capabilities\n');
  console.log('═'.repeat(80));
  
  // Test cases
  const testQueries = [
    {
      name: 'Semantic Search - Cleaning Products',
      query: 'umweltfreundliche Reinigungsmittel',
      filters: {}
    },
    {
      name: 'Price Range Filter',
      query: 'günstige Produkte',
      filters: {
        priceRange: [0, 15] as [number, number]
      }
    },
    {
      name: 'Brand Search',
      query: 'everdrop Waschmittel',
      filters: {
        brands: ['everdrop']
      }
    },
    {
      name: 'Category Filter',
      query: 'Badreiniger',
      filters: {
        categories: ['Reinigungsmittel']
      }
    },
    {
      name: 'Complex Query',
      query: 'vegane Produkte ohne Mikroplastik unter 20 Euro',
      filters: {
        priceRange: [0, 20] as [number, number]
      }
    }
  ];
  
  for (const test of testQueries) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`   Query: "${test.query}"`);
    if (Object.keys(test.filters).length > 0) {
      console.log(`   Filters:`, test.filters);
    }
    console.log('─'.repeat(80));
    
    try {
      // Test vector search
      console.log('\n🔍 Vector Search Results:');
      const vectorResults = await vectorSearch({
        query: test.query,
        filters: test.filters,
        limit: 5,
        includeChunks: true,
        rerank: true
      });
      
      if (vectorResults.length === 0) {
        console.log('   No results found');
      } else {
        vectorResults.forEach((result, idx) => {
          console.log(`\n   ${idx + 1}. ${result.name}`);
          console.log(`      Price: €${result.price || 'N/A'}`);
          console.log(`      Brand: ${result.brand || 'N/A'}`);
          console.log(`      Category: ${result.category || 'N/A'}`);
          console.log(`      Similarity: ${(result.similarity * 100).toFixed(1)}%`);
          console.log(`      URL: ${result.url}`);
          
          if (result.chunks && result.chunks.length > 0) {
            console.log(`      Top Chunks:`);
            result.chunks.slice(0, 2).forEach(chunk => {
              console.log(`        - [${chunk.chunkType}] ${chunk.content.substring(0, 100)}...`);
              console.log(`          Similarity: ${(chunk.similarity * 100).toFixed(1)}%`);
            });
          }
        });
      }
      
      // Test hybrid search
      console.log('\n🔍 Hybrid Search Results:');
      const hybridResults = await hybridSearch({
        query: test.query,
        filters: test.filters,
        limit: 5,
        vectorWeight: 0.7,
        keywordWeight: 0.3
      });
      
      if (hybridResults.length === 0) {
        console.log('   No results found');
      } else {
        hybridResults.forEach((result, idx) => {
          console.log(`\n   ${idx + 1}. ${result.name}`);
          console.log(`      Combined Score: ${(result.similarity * 100).toFixed(1)}%`);
        });
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('\n' + '═'.repeat(80));
  }
  
  // Test relevance and diversity
  console.log('\n📊 Testing Relevance and Diversity with MMR Reranking');
  console.log('─'.repeat(80));
  
  try {
    const mmrResults = await vectorSearch({
      query: 'Reinigungsmittel für Zuhause',
      limit: 10,
      rerank: true  // This will apply MMR
    });
    
    console.log(`Found ${mmrResults.length} products after MMR reranking:`);
    
    // Analyze diversity
    const categories = new Set(mmrResults.map(r => r.category));
    const brands = new Set(mmrResults.map(r => r.brand));
    const priceRanges = {
      low: mmrResults.filter(r => r.price && parseFloat(r.price) < 10).length,
      medium: mmrResults.filter(r => r.price && parseFloat(r.price) >= 10 && parseFloat(r.price) < 20).length,
      high: mmrResults.filter(r => r.price && parseFloat(r.price) >= 20).length
    };
    
    console.log(`\nDiversity Metrics:`);
    console.log(`  Unique Categories: ${categories.size}`);
    console.log(`  Unique Brands: ${brands.size}`);
    console.log(`  Price Distribution: Low (${priceRanges.low}), Medium (${priceRanges.medium}), High (${priceRanges.high})`);
    
    mmrResults.forEach((result, idx) => {
      console.log(`\n${idx + 1}. ${result.name}`);
      console.log(`   Category: ${result.category} | Brand: ${result.brand} | Price: €${result.price || 'N/A'}`);
    });
    
  } catch (error) {
    console.error(`❌ MMR test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  console.log('\n✅ RAG Search Tests Complete!');
}

// Run tests
testRAGSearch().catch(console.error).finally(() => process.exit(0));