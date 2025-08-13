import { db, products, productChunks, Product } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { extractWithLLM } from './llmExtractor.js';
import { createChunks, splitLargeChunk } from './chunker.js';
import { generateEmbeddings } from './embedder.js';
import { createHash } from '../utils/hash.js';

export interface ProcessProductInput {
  url: string;
  markdown: string;
  metadata?: any;
  shopId: string;
}

export interface ProcessProductResult {
  isNew: boolean;
  product?: Product;
  error?: string;
}

/**
 * Process a product page: extract, chunk, embed, and store
 */
export async function processProduct(input: ProcessProductInput): Promise<ProcessProductResult> {
  try {
    console.log(`📦 Processing product: ${input.url}`);
    
    // 1. Check if product already exists
    const existingProduct = await checkProductExists(input.url);
    
    // Calculate version hash
    const versionHash = createHash(input.markdown);
    
    // If product exists and hash hasn't changed, skip
    if (existingProduct && existingProduct.versionHash === versionHash) {
      console.log(`⏭️ Skipping product (unchanged): ${existingProduct.name}`);
      return {
        isNew: false,
        product: existingProduct,
      };
    }
    
    // 2. Extract product data using LLM
    const extracted = await extractWithLLM({
      markdown: input.markdown,
      metadata: input.metadata,
      url: input.url,
    });
    
    // 3. Prepare product data for database (handle null values from LLM)
    const productData = {
      shopId: input.shopId,
      url: input.url,
      name: extracted.name,
      description: extracted.description ?? null,
      productType: extracted.product_type ?? null,
      category: extracted.category ?? null,
      subcategory: extracted.subcategory ?? null,
      tags: extracted.tags ?? [],
      priceNumeric: extracted.price ? extracted.price.toString() : null,
      priceOriginal: extracted.price_original ? extracted.price_original.toString() : null,
      currency: extracted.currency ?? 'EUR',
      availability: extracted.availability ?? null,
      ratingValue: extracted.rating_value ? extracted.rating_value.toString() : null,
      ratingCount: extracted.rating_count ?? null,
      brand: extracted.brand ?? null,
      sku: extracted.sku ?? null,
      ean: extracted.ean ?? null,
      claims: extracted.claims ?? [],
      warnings: extracted.warnings ?? [],
      specifications: extracted.specifications ?? {},
      attributes: extracted.attributes ?? {},
      images: (extracted.images ?? []).map(img => ({
        url: img.url,
        alt: img.alt || undefined,
        type: img.type || undefined
      })),
      videos: (extracted.videos ?? []).map(vid => ({
        url: vid.url,
        title: vid.title || undefined,
        type: vid.type || undefined
      })),
      locale: input.metadata?.language || 'de-DE',
      pageMarkdown: input.markdown,
      extractedData: extracted,
      versionHash: versionHash,
      lastCrawledAt: new Date(),
    };
    
    // 4. Upsert product to database
    const [product] = await db
      .insert(products)
      .values(productData)
      .onConflictDoUpdate({
        target: products.url,
        set: {
          ...productData,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    console.log(`💾 Saved product: ${product.name} (${product.id})`);
    
    // 5. Create chunks from extracted data
    const rawChunks = createChunks(extracted);
    
    // Split large chunks if needed
    const allChunks = rawChunks.flatMap(chunk => splitLargeChunk(chunk));
    
    if (allChunks.length === 0) {
      console.warn(`⚠️ No chunks created for product: ${product.name}`);
      return {
        isNew: !existingProduct,
        product,
      };
    }
    
    // 6. Generate embeddings for chunks
    const chunkTexts = allChunks.map(c => c.chunkContent);
    const embeddings = await generateEmbeddings(chunkTexts);
    
    // 7. Delete old chunks if updating
    if (existingProduct) {
      await db
        .delete(productChunks)
        .where(eq(productChunks.productId, product.id));
      console.log(`🗑️ Deleted old chunks for product update`);
    }
    
    // 8. Store chunks with embeddings
    const chunkRecords = allChunks.map((chunk, idx) => ({
      productId: product.id,
      chunkType: chunk.chunkType,
      chunkContent: chunk.chunkContent,
      embedding: embeddings[idx], // Pass as number array, schema will handle conversion
      metadata: chunk.metadata || {},
      position: idx,
    }));
    
    // Batch insert chunks
    const batchSize = 10;
    for (let i = 0; i < chunkRecords.length; i += batchSize) {
      const batch = chunkRecords.slice(i, i + batchSize);
      await db.insert(productChunks).values(batch);
    }
    
    console.log(`✅ Created ${chunkRecords.length} chunks with embeddings`);
    
    return {
      isNew: !existingProduct,
      product,
    };
    
  } catch (error) {
    console.error(`❌ Error processing product ${input.url}:`, error);
    
    return {
      isNew: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a product already exists in the database
 */
async function checkProductExists(url: string): Promise<Product | null> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.url, url))
    .limit(1);
  
  return existing || null;
}

/**
 * Batch process multiple products
 */
export async function batchProcessProducts(
  inputs: ProcessProductInput[]
): Promise<ProcessProductResult[]> {
  console.log(`🔄 Batch processing ${inputs.length} products...`);
  
  const results: ProcessProductResult[] = [];
  
  // Process products sequentially to avoid overwhelming the APIs
  for (const input of inputs) {
    const result = await processProduct(input);
    results.push(result);
    
    // Small delay between products to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const newCount = results.filter(r => r.isNew).length;
  const errorCount = results.filter(r => r.error).length;
  
  console.log(`✅ Batch processing complete:`);
  console.log(`  - New products: ${newCount}`);
  console.log(`  - Updated products: ${results.length - newCount - errorCount}`);
  console.log(`  - Errors: ${errorCount}`);
  
  return results;
}

/**
 * Reprocess a product (force update)
 */
export async function reprocessProduct(productId: string): Promise<ProcessProductResult> {
  // Get product from database
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  
  if (!product) {
    return {
      isNew: false,
      error: 'Product not found',
    };
  }
  
  if (!product.pageMarkdown) {
    return {
      isNew: false,
      error: 'Product has no markdown content',
    };
  }
  
  // Force reprocess by clearing version hash
  await db
    .update(products)
    .set({ versionHash: null })
    .where(eq(products.id, productId));
  
  // Reprocess the product
  return processProduct({
    url: product.url,
    markdown: product.pageMarkdown,
    metadata: product.extractedData,
    shopId: product.shopId,
  });
}