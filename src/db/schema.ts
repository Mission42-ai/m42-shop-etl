import { 
  pgTable, 
  uuid, 
  text, 
  decimal, 
  timestamp, 
  jsonb, 
  index, 
  pgEnum,
  integer,
  customType
} from 'drizzle-orm/pg-core';

// Custom vector type for pgvector
// We use a simple approach that works with Drizzle Kit
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector';
  },
  toDriver(value: number[]): string {
    // pgvector expects format: [0.1,0.2,0.3,...]
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // Parse the PostgreSQL array format
    if (typeof value === 'string') {
      // Remove brackets and split by comma
      const cleaned = value.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map(Number);
    }
    return value;
  },
});

// Enums
export const productTypeEnum = pgEnum('product_type', [
  'fashion', 
  'furniture', 
  'electronics', 
  'food', 
  'beauty', 
  'sports', 
  'toys', 
  'books', 
  'other'
]);

export const availabilityEnum = pgEnum('availability', [
  'in_stock', 
  'out_of_stock', 
  'on_request', 
  'preorder', 
  'discontinued'
]);

export const crawlStatusEnum = pgEnum('crawl_status', [
  'pending',
  'running', 
  'completed',
  'failed'
]);

// Shops Table
export const shops = pgTable('shops', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull().unique(),
  shopType: text('shop_type'),
  crawlConfig: jsonb('crawl_config').$type<{
    includePaths: string[];
    excludePaths?: string[];
    maxDepth?: number;
    limit?: number;
  }>().default({
    includePaths: [],
    excludePaths: ['/cart', '/checkout', '/account'],
    maxDepth: 3,
    limit: 1000
  }),
  extractionHints: jsonb('extraction_hints').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Products Table
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  
  // Core Fields
  url: text('url').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  
  // Categorization
  productType: productTypeEnum('product_type'),
  category: text('category'),
  subcategory: text('subcategory'),
  tags: text('tags').array().default([]),
  
  // Pricing
  priceNumeric: decimal('price_numeric', { precision: 12, scale: 2 }),
  priceOriginal: decimal('price_original', { precision: 12, scale: 2 }),
  currency: text('currency').default('EUR'),
  availability: availabilityEnum('availability'),
  
  // Ratings
  ratingValue: decimal('rating_value', { precision: 3, scale: 2 }),
  ratingCount: integer('rating_count'),
  
  // Product Identifiers
  brand: text('brand'),
  sku: text('sku'),
  ean: text('ean'),
  
  // Flexible Data
  claims: text('claims').array().default([]),
  warnings: text('warnings').array().default([]),
  specifications: jsonb('specifications').$type<Record<string, any>>().default({}),
  attributes: jsonb('attributes').$type<Record<string, any>>().default({}),
  
  // Media
  images: jsonb('images').$type<Array<{
    url: string;
    alt?: string;
    type?: string;
  }>>().default([]),
  videos: jsonb('videos').$type<Array<{
    url: string;
    title?: string;
    type?: string;
  }>>().default([]),
  
  // Metadata
  locale: text('locale').default('de-DE'),
  pageMarkdown: text('page_markdown'),
  extractedData: jsonb('extracted_data').$type<any>(),
  
  // Tracking
  versionHash: text('version_hash'),
  lastCrawledAt: timestamp('last_crawled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    shopIdx: index('idx_products_shop').on(table.shopId),
    typeIdx: index('idx_products_type').on(table.productType),
    urlIdx: index('idx_products_url').on(table.url),
    brandIdx: index('idx_products_brand').on(table.brand)
  };
});

// Product Chunks Table for Vector Search
export const productChunks = pgTable('product_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  
  chunkType: text('chunk_type'), // 'main', 'specs', 'details', 'attributes'
  chunkContent: text('chunk_content').notNull(),
  embedding: vector('embedding'), // for text-embedding-3-small (1536 dimensions)
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  position: integer('position').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    productIdx: index('idx_chunks_product').on(table.productId),
    typeIdx: index('idx_chunks_type').on(table.chunkType)
  };
});

// Crawl Jobs Table for tracking
export const crawlJobs = pgTable('crawl_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  
  firecrawlJobId: text('firecrawl_job_id').unique(),
  status: crawlStatusEnum('status').default('pending'),
  
  config: jsonb('config').$type<{
    baseUrl: string;
    includePaths: string[];
    excludePaths?: string[];
    limit?: number;
    maxDepth?: number;
    webhookUrl?: string;
  }>(),
  
  stats: jsonb('stats').$type<{
    totalPages?: number;
    processedPages?: number;
    newProducts?: number;
    skippedProducts?: number;
    errors?: number;
  }>().default({}),
  
  errorLog: jsonb('error_log').$type<Array<{
    timestamp: string;
    url?: string;
    error: string;
  }>>().default([]),
  
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    shopIdx: index('idx_crawl_jobs_shop').on(table.shopId),
    statusIdx: index('idx_crawl_jobs_status').on(table.status),
    firecrawlIdx: index('idx_crawl_jobs_firecrawl').on(table.firecrawlJobId)
  };
});

// Processing Queue (for failed/retry items)
export const processingQueue = pgTable('processing_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  crawlJobId: uuid('crawl_job_id').references(() => crawlJobs.id),
  
  url: text('url').notNull(),
  markdown: text('markdown'),
  metadata: jsonb('metadata').$type<any>(),
  
  status: text('status').default('pending'), // 'pending', 'processing', 'completed', 'failed'
  attempts: integer('attempts').default(0),
  lastError: text('last_error'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at')
});

// Type exports for TypeScript
export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductChunk = typeof productChunks.$inferSelect;
export type NewProductChunk = typeof productChunks.$inferInsert;

export type CrawlJob = typeof crawlJobs.$inferSelect;
export type NewCrawlJob = typeof crawlJobs.$inferInsert;

export type ProcessingQueueItem = typeof processingQueue.$inferSelect;
export type NewProcessingQueueItem = typeof processingQueue.$inferInsert;