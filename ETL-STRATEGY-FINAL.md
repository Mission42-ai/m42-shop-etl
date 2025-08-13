# M42 Shop ETL - Technische Implementierungsstrategie

## 🎯 Projektziel
Entwicklung eines robusten ETL-Prozesses zur Extraktion und Vektorisierung von Produktdaten aus beliebigen Online-Shops.

## 🏗️ Technologie-Stack
- **Web Crawling**: Firecrawl API mit Webhook-Integration
- **Datenbank**: PostgreSQL (Supabase) mit pgvector
- **ORM**: Drizzle ORM für Type-Safety
- **LLM Processing**: OpenAI GPT-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small
- **Backend**: Node.js + TypeScript
- **Webhook Handler**: Express Server für Firecrawl Events

## 📐 Architektur

```mermaid
graph TD
    A[Shop Base URL + Paths] --> B[Firecrawl Crawl Job]
    B --> C{Webhook Events}
    C -->|crawl.page| D[Product Handler]
    C -->|crawl.completed| E[Job Complete Handler]
    D --> F{Product Exists?}
    F -->|No| G[LLM Extract]
    F -->|Yes| H[Skip]
    G --> I[Generate Chunks]
    I --> J[Create Embeddings]
    J --> K[Store via Drizzle]
```

## 🔄 Firecrawl Webhook Integration

### 1. Crawl Job Initialisierung
```typescript
interface CrawlJobConfig {
  baseUrl: string;           // z.B. "https://shop.example.com"
  includePaths: string[];    // z.B. ["/products", "/artikel", "/item"]
  excludePaths?: string[];   // z.B. ["/cart", "/checkout"]
  webhookUrl: string;        // Unser Webhook Endpoint
}

async function startCrawlJob(config: CrawlJobConfig) {
  const response = await firecrawl.crawl({
    url: config.baseUrl,
    crawlerOptions: {
      includes: config.includePaths.map(path => `${config.baseUrl}${path}/*`),
      excludes: config.excludePaths?.map(path => `${config.baseUrl}${path}/*`),
      limit: 1000,
      maxDepth: 3
    },
    webhookConfig: {
      url: config.webhookUrl,
      events: ['crawl.page', 'crawl.completed', 'crawl.failed']
    }
  });
  
  return response.jobId;
}
```

### 2. Webhook Handler
```typescript
// Express Webhook Endpoint
app.post('/webhook/firecrawl', async (req, res) => {
  const { type, id, data } = req.body;
  
  switch(type) {
    case 'crawl.page':
      // Neues Produkt gefunden
      await handleNewProduct(data);
      break;
      
    case 'crawl.completed':
      // Crawl Job abgeschlossen
      await handleJobComplete(id);
      break;
      
    case 'crawl.failed':
      // Error Handling
      await handleJobFailed(id, data);
      break;
  }
  
  res.status(200).send('OK');
});

async function handleNewProduct(crawlData: any) {
  const { url, markdown, metadata } = crawlData;
  
  // Check Duplikate
  const exists = await db.select()
    .from(products)
    .where(eq(products.url, url))
    .limit(1);
    
  if (exists.length > 0) return;
  
  // Process new product
  await processProduct(crawlData);
}
```

## 📊 Drizzle ORM Schema

### Schema Definition
```typescript
// src/db/schema.ts
import { pgTable, uuid, text, decimal, timestamp, jsonb, vector, index, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const productTypeEnum = pgEnum('product_type', [
  'fashion', 'furniture', 'electronics', 'food', 
  'beauty', 'sports', 'toys', 'books', 'other'
]);

export const availabilityEnum = pgEnum('availability', [
  'in_stock', 'out_of_stock', 'on_request', 'preorder', 'discontinued'
]);

// Shops Table
export const shops = pgTable('shops', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  shopType: text('shop_type'),
  crawlConfig: jsonb('crawl_config').$type<{
    includePaths: string[];
    excludePaths?: string[];
    maxDepth?: number;
    limit?: number;
  }>(),
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
  
  // Generic Fields
  brand: text('brand'),
  sku: text('sku'),
  ean: text('ean'),
  
  // Flexible Data
  claims: text('claims').array().default([]),
  warnings: text('warnings').array().default([]),
  specifications: jsonb('specifications').$type<Record<string, any>>(),
  attributes: jsonb('attributes').$type<Record<string, any>>(),
  
  // Media
  images: jsonb('images').$type<Array<{
    url: string;
    alt?: string;
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
    urlIdx: index('idx_products_url').on(table.url)
  };
});

// Product Chunks Table
export const productChunks = pgTable('product_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  
  chunkType: text('chunk_type'), // 'main', 'specs', 'details'
  chunkContent: text('chunk_content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  position: integer('position'),
  
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    productIdx: index('idx_chunks_product').on(table.productId),
    embeddingIdx: index('idx_chunks_embedding').using('hnsw', table.embedding.op('vector_cosine_ops'))
  };
});

// Crawl Jobs Table (für Tracking)
export const crawlJobs = pgTable('crawl_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  
  firecrawlJobId: text('firecrawl_job_id').unique(),
  status: text('status'), // 'pending', 'running', 'completed', 'failed'
  
  config: jsonb('config').$type<any>(),
  stats: jsonb('stats').$type<{
    totalPages?: number;
    processedPages?: number;
    newProducts?: number;
    skippedProducts?: number;
    errors?: number;
  }>(),
  
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Types für TypeScript
export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductChunk = typeof productChunks.$inferSelect;
export type NewProductChunk = typeof productChunks.$inferInsert;
export type CrawlJob = typeof crawlJobs.$inferSelect;
```

### Drizzle Config
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### Database Connection
```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);

export const db = drizzle(sql, { schema });
```

## 🔧 ETL Pipeline Komponenten

### 1. Product Processor
```typescript
// src/services/productProcessor.ts
import { db } from '../db';
import { products, productChunks } from '../db/schema';
import { extractWithLLM } from './llmExtractor';
import { createChunks } from './chunker';
import { generateEmbeddings } from './embedder';

export async function processProduct(crawlData: {
  url: string;
  markdown: string;
  metadata: any;
  shopId: string;
}) {
  try {
    // 1. LLM Extraction
    const extracted = await extractWithLLM({
      markdown: crawlData.markdown,
      metadata: crawlData.metadata,
      url: crawlData.url
    });
    
    // 2. Create Product Record
    const [product] = await db.insert(products).values({
      shopId: crawlData.shopId,
      url: crawlData.url,
      name: extracted.name,
      description: extracted.description,
      productType: extracted.product_type,
      category: extracted.category,
      subcategory: extracted.subcategory,
      tags: extracted.tags,
      priceNumeric: extracted.price?.toString(),
      currency: extracted.currency,
      availability: extracted.availability,
      brand: extracted.brand,
      sku: extracted.sku,
      claims: extracted.claims,
      warnings: extracted.warnings,
      specifications: extracted.specifications,
      attributes: extracted.attributes,
      images: extracted.images,
      pageMarkdown: crawlData.markdown,
      extractedData: extracted,
      versionHash: createHash(crawlData.markdown),
      lastCrawledAt: new Date()
    }).returning();
    
    // 3. Create Chunks
    const chunks = createChunks(extracted);
    
    // 4. Generate Embeddings
    const embeddings = await generateEmbeddings(
      chunks.map(c => c.chunkContent)
    );
    
    // 5. Store Chunks with Embeddings
    const chunkRecords = chunks.map((chunk, idx) => ({
      productId: product.id,
      chunkType: chunk.chunkType,
      chunkContent: chunk.chunkContent,
      embedding: embeddings[idx],
      metadata: chunk.metadata,
      position: idx
    }));
    
    await db.insert(productChunks).values(chunkRecords);
    
    return product;
    
  } catch (error) {
    console.error('Error processing product:', error);
    throw error;
  }
}
```

### 2. LLM Extractor
```typescript
// src/services/llmExtractor.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EXTRACTION_SCHEMA = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    product_type: { 
      type: "string",
      enum: ["fashion", "furniture", "electronics", "food", "beauty", "sports", "toys", "books", "other"]
    },
    category: { type: "string" },
    subcategory: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    price: { type: "number" },
    currency: { type: "string" },
    availability: { type: "string" },
    brand: { type: "string" },
    sku: { type: "string" },
    claims: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    specifications: { type: "object" },
    attributes: { type: "object" },
    images: { type: "array" }
  }
};

export async function extractWithLLM(data: {
  markdown: string;
  metadata: any;
  url: string;
}) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a product data extractor. Extract structured product information from the given markdown.
        Return data according to the provided schema. Be precise and only include information that is clearly present.`
      },
      {
        role: "user",
        content: `URL: ${data.url}
        
METADATA: ${JSON.stringify(data.metadata)}

MARKDOWN:
${data.markdown.slice(0, 50000)} // Truncate if too long

Extract product data according to this schema:
${JSON.stringify(EXTRACTION_SCHEMA, null, 2)}`
      }
    ],
    temperature: 0,
    max_tokens: 4000
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}
```

## 📦 Dependencies

```json
{
  "dependencies": {
    "drizzle-orm": "^0.29.x",
    "postgres": "^3.x",
    "@types/pg": "^8.x",
    "openai": "^4.x",
    "express": "^4.x",
    "dotenv": "^16.x",
    "crypto": "^1.x"
  },
  "devDependencies": {
    "drizzle-kit": "^0.20.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

## 🚀 Setup & Deployment

### 1. Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# APIs
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...

# Webhook
WEBHOOK_URL=https://your-app.com/webhook/firecrawl
PORT=3000
```

### 2. Database Migration
```bash
# Generate migration
npx drizzle-kit generate:pg

# Push schema to database
npx drizzle-kit push:pg

# Enable pgvector extension
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 3. Start Crawl Job
```typescript
// src/scripts/startCrawl.ts
async function startShopCrawl(shopName: string, includePaths: string[]) {
  // 1. Create/Get Shop
  const [shop] = await db.insert(shops).values({
    name: shopName,
    baseUrl: `https://${shopName}`,
    crawlConfig: {
      includePaths,
      excludePaths: ['/cart', '/checkout', '/account'],
      maxDepth: 3,
      limit: 1000
    }
  }).onConflictDoUpdate({
    target: shops.baseUrl,
    set: { updatedAt: new Date() }
  }).returning();
  
  // 2. Start Crawl Job
  const jobId = await startCrawlJob({
    baseUrl: shop.baseUrl,
    includePaths: shop.crawlConfig.includePaths,
    excludePaths: shop.crawlConfig.excludePaths,
    webhookUrl: process.env.WEBHOOK_URL
  });
  
  // 3. Track Job
  await db.insert(crawlJobs).values({
    shopId: shop.id,
    firecrawlJobId: jobId,
    status: 'running',
    config: shop.crawlConfig,
    startedAt: new Date()
  });
  
  console.log(`Started crawl job ${jobId} for ${shopName}`);
}

// Usage
startShopCrawl('example-shop.com', ['/products', '/artikel']);
```

## 📊 Monitoring & Metrics

```typescript
// src/services/metrics.ts
export async function getCrawlStats(jobId: string) {
  const stats = await db.select({
    totalProducts: count(products.id),
    totalChunks: count(productChunks.id),
    avgChunksPerProduct: avg(productChunks.position)
  })
  .from(crawlJobs)
  .leftJoin(products, eq(products.shopId, crawlJobs.shopId))
  .leftJoin(productChunks, eq(productChunks.productId, products.id))
  .where(eq(crawlJobs.firecrawlJobId, jobId))
  .groupBy(crawlJobs.id);
  
  return stats;
}
```

## 🔄 Nächste Schritte

1. **Webhook Server aufsetzen** mit Express
2. **Drizzle Schema** in Code implementieren
3. **Firecrawl Integration** testen
4. **LLM Extraction** optimieren
5. **Error Handling** & Retry Logic
6. **Monitoring Dashboard** (optional)

---

**Wichtig**: Dieser ETL-Prozess ist vollständig auf die Datenextraktion fokussiert. RAG-Funktionalität kann später als separate Komponente hinzugefügt werden.