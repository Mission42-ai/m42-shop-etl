import { db, products, productChunks } from '../db/index.js';
import { sql, and, gte, lte, inArray, eq, desc } from 'drizzle-orm';
import { generateEmbeddings } from '../services/embedder.js';

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  threshold?: number;
  filters?: {
    shopId?: string;
    priceRange?: [number, number];
    categories?: string[];
    brands?: string[];
    availability?: string[];
    productTypes?: string[];
  };
  includeChunks?: boolean;
  rerank?: boolean;
}

export interface SearchResult {
  productId: string;
  name: string;
  description: string | null;
  url: string;
  price: string | null;
  brand: string | null;
  category: string | null;
  similarity: number;
  chunks?: ChunkResult[];
  metadata: any;
}

export interface ChunkResult {
  chunkId: string;
  chunkType: string;
  content: string;
  similarity: number;
  position: number;
}

/**
 * Perform vector similarity search using pgvector
 */
export async function vectorSearch(options: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    limit = 10,
    offset = 0,
    threshold = 0.5,
    filters = {},
    includeChunks = false,
    rerank = false
  } = options;

  console.log(`🔍 Vector search for: "${query}"`);
  
  // Generate embedding for the query
  const [queryEmbedding] = await generateEmbeddings([query]);
  
  // Convert embedding to PostgreSQL array format
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  // Build filter conditions
  const filterConditions = [];
  
  if (filters.shopId) {
    filterConditions.push(eq(products.shopId, filters.shopId));
  }
  
  if (filters.priceRange) {
    const [min, max] = filters.priceRange;
    if (min !== undefined) {
      filterConditions.push(gte(products.priceNumeric, min.toString()));
    }
    if (max !== undefined) {
      filterConditions.push(lte(products.priceNumeric, max.toString()));
    }
  }
  
  if (filters.categories?.length) {
    filterConditions.push(inArray(products.category, filters.categories));
  }
  
  if (filters.brands?.length) {
    filterConditions.push(inArray(products.brand, filters.brands));
  }
  
  if (filters.availability?.length) {
    filterConditions.push(
      inArray(
        products.availability, 
        filters.availability as ("in_stock" | "out_of_stock" | "on_request" | "preorder" | "discontinued")[]
      )
    );
  }
  
  if (filters.productTypes?.length) {
    filterConditions.push(
      inArray(
        products.productType, 
        filters.productTypes as ("fashion" | "furniture" | "electronics" | "food" | "beauty" | "sports" | "toys" | "books" | "other")[]
      )
    );
  }
  
  // Perform vector similarity search on chunks
  const chunkResults = await db
    .select({
      productId: productChunks.productId,
      chunkId: productChunks.id,
      chunkType: productChunks.chunkType,
      chunkContent: productChunks.chunkContent,
      position: productChunks.position,
      similarity: sql<number>`1 - (${productChunks.embedding} <=> ${embeddingStr}::vector)`,
    })
    .from(productChunks)
    .where(
      and(
        sql`1 - (${productChunks.embedding} <=> ${embeddingStr}::vector) > ${threshold}`,
        ...filterConditions.map(condition => 
          sql`${productChunks.productId} IN (
            SELECT ${products.id} FROM ${products} WHERE ${condition}
          )`
        )
      )
    )
    .orderBy(desc(sql`1 - (${productChunks.embedding} <=> ${embeddingStr}::vector)`))
    .limit(limit * 3) // Get more chunks to aggregate by product
    .offset(offset);
  
  // Group chunks by product and calculate aggregate similarity
  const productScores = new Map<string, {
    maxSimilarity: number;
    avgSimilarity: number;
    chunks: ChunkResult[];
  }>();
  
  for (const chunk of chunkResults) {
    const existing = productScores.get(chunk.productId) || {
      maxSimilarity: 0,
      avgSimilarity: 0,
      chunks: []
    };
    
    existing.maxSimilarity = Math.max(existing.maxSimilarity, chunk.similarity);
    existing.chunks.push({
      chunkId: chunk.chunkId,
      chunkType: chunk.chunkType as string,
      content: chunk.chunkContent || '',
      similarity: chunk.similarity,
      position: chunk.position || 0
    });
    
    // Update average
    existing.avgSimilarity = 
      existing.chunks.reduce((sum, c) => sum + c.similarity, 0) / existing.chunks.length;
    
    productScores.set(chunk.productId, existing);
  }
  
  // Get top products by combined score
  const topProductIds = Array.from(productScores.entries())
    .map(([productId, scores]) => ({
      productId,
      // Combine max and average similarity (weighted)
      combinedScore: scores.maxSimilarity * 0.7 + scores.avgSimilarity * 0.3,
      chunks: scores.chunks
    }))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
  
  if (topProductIds.length === 0) {
    console.log('⚠️ No results found');
    return [];
  }
  
  // Fetch product details
  const productDetails = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      url: products.url,
      price: products.priceNumeric,
      brand: products.brand,
      category: products.category,
      subcategory: products.subcategory,
      productType: products.productType,
      availability: products.availability,
      claims: products.claims,
      specifications: products.specifications,
      images: products.images,
      ratingValue: products.ratingValue,
      ratingCount: products.ratingCount
    })
    .from(products)
    .where(inArray(products.id, topProductIds.map(p => p.productId)));
  
  // Create product map for easy lookup
  const productMap = new Map(productDetails.map(p => [p.id, p]));
  
  // Build final results
  const results: SearchResult[] = topProductIds.map(item => {
    const product = productMap.get(item.productId);
    if (!product) return null;
    
    return {
      productId: product.id,
      name: product.name,
      description: product.description,
      url: product.url,
      price: product.price,
      brand: product.brand,
      category: product.category,
      similarity: item.combinedScore,
      chunks: includeChunks ? item.chunks.sort((a, b) => b.similarity - a.similarity).slice(0, 3) : undefined,
      metadata: {
        subcategory: product.subcategory,
        productType: product.productType,
        availability: product.availability,
        claims: product.claims,
        specifications: product.specifications,
        images: product.images,
        rating: product.ratingValue ? {
          value: parseFloat(product.ratingValue),
          count: product.ratingCount
        } : null
      }
    };
  }).filter(Boolean) as SearchResult[];
  
  console.log(`✅ Found ${results.length} products`);
  
  // Apply reranking if requested
  if (rerank && results.length > 0) {
    return await rerankResults(query, results);
  }
  
  return results;
}

/**
 * Rerank results using Maximum Marginal Relevance (MMR)
 * Balances relevance with diversity
 */
async function rerankResults(
  _query: string,
  results: SearchResult[],
  lambda: number = 0.7
): Promise<SearchResult[]> {
  console.log('🔄 Reranking results with MMR...');
  
  const reranked: SearchResult[] = [];
  const remaining = [...results];
  
  // Start with the most relevant result
  const first = remaining.shift();
  if (first) reranked.push(first);
  
  // Iteratively select results that maximize MMR score
  while (remaining.length > 0 && reranked.length < results.length) {
    let bestScore = -Infinity;
    let bestIndex = -1;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      
      // Relevance score (already computed)
      const relevance = candidate.similarity;
      
      // Diversity score (minimum similarity to already selected items)
      let maxSimilarityToSelected = 0;
      for (const selected of reranked) {
        // Simple diversity based on category, brand, and price
        let similarity = 0;
        if (selected.category === candidate.category) similarity += 0.3;
        if (selected.brand === candidate.brand) similarity += 0.3;
        if (selected.price && candidate.price) {
          const priceDiff = Math.abs(parseFloat(selected.price) - parseFloat(candidate.price));
          const maxPrice = Math.max(parseFloat(selected.price), parseFloat(candidate.price));
          similarity += 0.4 * (1 - priceDiff / maxPrice);
        }
        maxSimilarityToSelected = Math.max(maxSimilarityToSelected, similarity);
      }
      
      // MMR score = λ * relevance - (1 - λ) * maxSimilarityToSelected
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarityToSelected;
      
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = i;
      }
    }
    
    if (bestIndex >= 0) {
      reranked.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    } else {
      break;
    }
  }
  
  console.log('✅ Reranking complete');
  return reranked;
}

/**
 * Hybrid search combining vector similarity and keyword matching
 */
export async function hybridSearch(
  options: SearchOptions & {
    vectorWeight?: number;
    keywordWeight?: number;
  }
): Promise<SearchResult[]> {
  const {
    query,
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    ...searchOptions
  } = options;
  
  console.log(`🔍 Hybrid search for: "${query}"`);
  
  // Perform vector search
  const vectorResults = await vectorSearch({ ...searchOptions, query, rerank: false });
  
  // Perform keyword search
  const keywordResults = await keywordSearch({ ...searchOptions, query });
  
  // Combine and rerank results
  const combinedScores = new Map<string, number>();
  const resultMap = new Map<string, SearchResult>();
  
  // Add vector search results
  for (const result of vectorResults) {
    combinedScores.set(result.productId, result.similarity * vectorWeight);
    resultMap.set(result.productId, result);
  }
  
  // Add keyword search results
  for (const result of keywordResults) {
    const currentScore = combinedScores.get(result.productId) || 0;
    combinedScores.set(result.productId, currentScore + result.similarity * keywordWeight);
    
    // Update result if not already present
    if (!resultMap.has(result.productId)) {
      resultMap.set(result.productId, result);
    }
  }
  
  // Sort by combined score
  const sortedResults = Array.from(combinedScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, searchOptions.limit || 10)
    .map(([productId, score]) => {
      const result = resultMap.get(productId)!;
      return { ...result, similarity: score };
    });
  
  console.log(`✅ Hybrid search found ${sortedResults.length} products`);
  
  return sortedResults;
}

/**
 * Keyword-based search using PostgreSQL full-text search
 */
async function keywordSearch(options: SearchOptions): Promise<SearchResult[]> {
  const { query, limit = 10, offset = 0, filters = {} } = options;
  
  console.log(`📝 Keyword search for: "${query}"`);
  
  // Build filter conditions
  const filterConditions = [];
  
  if (filters.shopId) {
    filterConditions.push(eq(products.shopId, filters.shopId));
  }
  
  if (filters.priceRange) {
    const [min, max] = filters.priceRange;
    if (min !== undefined) {
      filterConditions.push(gte(products.priceNumeric, min.toString()));
    }
    if (max !== undefined) {
      filterConditions.push(lte(products.priceNumeric, max.toString()));
    }
  }
  
  // ... other filters
  
  // Perform text search on product fields
  const results = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      url: products.url,
      price: products.priceNumeric,
      brand: products.brand,
      category: products.category,
      subcategory: products.subcategory,
      productType: products.productType,
      availability: products.availability,
      claims: products.claims,
      specifications: products.specifications,
      images: products.images,
      ratingValue: products.ratingValue,
      ratingCount: products.ratingCount,
      // Calculate text similarity score
      similarity: sql<number>`
        GREATEST(
          similarity(${products.name}, ${query}),
          similarity(COALESCE(${products.description}, ''), ${query}),
          similarity(COALESCE(${products.category}, ''), ${query}),
          similarity(COALESCE(${products.brand}, ''), ${query})
        )
      `
    })
    .from(products)
    .where(
      and(
        sql`
          ${products.name} ILIKE ${'%' + query + '%'} OR
          ${products.description} ILIKE ${'%' + query + '%'} OR
          ${products.category} ILIKE ${'%' + query + '%'} OR
          ${products.brand} ILIKE ${'%' + query + '%'}
        `,
        ...filterConditions
      )
    )
    .orderBy(desc(sql`similarity`))
    .limit(limit)
    .offset(offset);
  
  return results.map(product => ({
    productId: product.id,
    name: product.name,
    description: product.description,
    url: product.url,
    price: product.price,
    brand: product.brand,
    category: product.category,
    similarity: product.similarity || 0,
    metadata: {
      subcategory: product.subcategory,
      productType: product.productType,
      availability: product.availability,
      claims: product.claims,
      specifications: product.specifications,
      images: product.images,
      rating: product.ratingValue ? {
        value: parseFloat(product.ratingValue),
        count: product.ratingCount
      } : null
    }
  }));
}