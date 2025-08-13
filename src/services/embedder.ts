import OpenAI from 'openai';
import { apiConfig } from '../config/index.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiConfig.openai.apiKey,
});

/**
 * Generate embeddings for text chunks using OpenAI
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  
  try {
    console.log(`🔢 Generating embeddings for ${texts.length} chunks...`);
    
    // OpenAI has a limit of 8192 tokens per request for embeddings
    // We'll batch the requests if needed
    const batchSize = 20; // Process 20 texts at a time
    const embeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await openai.embeddings.create({
        model: apiConfig.openai.embedModel,
        input: batch,
      });
      
      // Extract embeddings from response
      const batchEmbeddings = response.data.map(item => item.embedding);
      embeddings.push(...batchEmbeddings);
      
      console.log(`  Generated ${Math.min(i + batchSize, texts.length)}/${texts.length} embeddings`);
    }
    
    console.log(`✅ Successfully generated ${embeddings.length} embeddings`);
    
    return embeddings;
    
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}

/**
 * Generate a single embedding for a text
 */
export async function generateSingleEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

/**
 * Format embeddings for PostgreSQL pgvector
 * pgvector expects embeddings in the format: '[0.1, 0.2, 0.3, ...]'
 */
export function formatEmbeddingForPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Calculate cosine similarity between two embeddings
 * (Useful for testing and validation)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Batch process chunks with embeddings
 */
export interface ChunkWithEmbedding {
  chunkContent: string;
  embedding: number[];
}

export async function generateChunkEmbeddings(
  chunks: Array<{ chunkContent: string; [key: string]: any }>
): Promise<ChunkWithEmbedding[]> {
  const texts = chunks.map(c => c.chunkContent);
  const embeddings = await generateEmbeddings(texts);
  
  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));
}

/**
 * Validate embedding dimensions
 */
export function validateEmbeddingDimensions(embedding: number[]): boolean {
  const expectedDim = apiConfig.openai.embedDim;
  
  if (embedding.length !== expectedDim) {
    console.error(`Invalid embedding dimensions: expected ${expectedDim}, got ${embedding.length}`);
    return false;
  }
  
  return true;
}

/**
 * Create a query embedding for search
 */
export async function createQueryEmbedding(query: string): Promise<number[]> {
  console.log(`🔍 Creating query embedding for: "${query}"`);
  
  const embedding = await generateSingleEmbedding(query);
  
  if (!validateEmbeddingDimensions(embedding)) {
    throw new Error('Invalid query embedding dimensions');
  }
  
  return embedding;
}