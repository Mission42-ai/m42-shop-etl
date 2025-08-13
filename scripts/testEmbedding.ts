import { db, productChunks } from '../src/db/index.js';
import { generateEmbeddings } from '../src/services/embedder.js';
import dotenv from 'dotenv';

dotenv.config();

async function testEmbedding() {
  try {
    console.log('🧪 Testing embedding storage...\n');
    
    // Generate a test embedding
    const testText = "This is a test product chunk for embedding storage";
    console.log('📝 Test text:', testText);
    
    const [embedding] = await generateEmbeddings([testText]);
    console.log('✅ Generated embedding with dimensions:', embedding.length);
    console.log('📊 First 5 values:', embedding.slice(0, 5));
    
    // Try to insert into database
    console.log('\n💾 Attempting to store in database...');
    
    const testChunk = {
      productId: '8c9e7c6f-7e12-4c6e-b9ef-8e9f9e9f9e9f', // Dummy UUID
      chunkType: 'test',
      chunkContent: testText,
      embedding: embedding, // Pass as array
      metadata: { test: true },
      position: 0
    };
    
    const result = await db.insert(productChunks).values(testChunk).returning();
    
    console.log('✅ Successfully stored chunk with ID:', result[0].id);
    
    // Clean up test data
    await db.delete(productChunks).where({ id: result[0].id });
    console.log('🧹 Cleaned up test data');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

testEmbedding();