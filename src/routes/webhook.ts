import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, crawlJobs } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { processProduct } from '../services/productProcessor.js';

const router = Router();

// Firecrawl webhook event schema
const webhookEventSchema = z.object({
  success: z.boolean(),
  type: z.enum(['crawl.started', 'crawl.page', 'crawl.completed', 'crawl.failed']),
  id: z.string(), // Firecrawl job ID
  data: z.any().optional(),
  metadata: z.any().optional(),
  error: z.string().optional(),
});

// Crawl page data schema - v1 API format
const crawlPageSchema = z.object({
  url: z.string().url().optional(), // Sometimes missing in v1
  markdown: z.string(),
  html: z.string().optional(),
  metadata: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    language: z.string().optional(),
    sourceURL: z.string().optional(),
    url: z.string().optional(), // URL might be in metadata
    statusCode: z.number().optional(),
  }).optional(),
});

// POST /webhook/firecrawl
router.post('/firecrawl', async (req: Request, res: Response) => {
  try {
    // Parse and validate webhook event
    const event = webhookEventSchema.parse(req.body);
    
    console.log(`📨 Received webhook event: ${event.type} for job ${event.id}`);
    
    // Get crawl job from database
    const [crawlJob] = await db
      .select()
      .from(crawlJobs)
      .where(eq(crawlJobs.firecrawlJobId, event.id))
      .limit(1);
    
    if (!crawlJob) {
      console.warn(`⚠️ No crawl job found for Firecrawl ID: ${event.id}`);
      return res.status(200).json({ status: 'ignored', reason: 'unknown_job' });
    }
    
    // Handle different event types
    switch (event.type) {
      case 'crawl.started':
        await handleCrawlStarted(crawlJob.id, event);
        break;
        
      case 'crawl.page':
        await handleCrawlPage(crawlJob.id, crawlJob.shopId, event);
        break;
        
      case 'crawl.completed':
        await handleCrawlCompleted(crawlJob.id, event);
        break;
        
      case 'crawl.failed':
        await handleCrawlFailed(crawlJob.id, event);
        break;
    }
    
    res.status(200).json({ status: 'processed' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Always return 200 to avoid retries from Firecrawl
    res.status(200).json({ 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Handle crawl started event
async function handleCrawlStarted(crawlJobId: string, event: any) {
  console.log(`🚀 Crawl started for job ${crawlJobId}`);
  
  await db
    .update(crawlJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(eq(crawlJobs.id, crawlJobId));
}

// Handle crawl page event
async function handleCrawlPage(crawlJobId: string, shopId: string, event: any) {
  try {
    // Debug: Log the actual data structure
    console.log('📝 Webhook data structure:', JSON.stringify(event.data, null, 2).substring(0, 500));
    
    // Parse page data - v1 API sends array
    const pagesArray = Array.isArray(event.data) ? event.data : [event.data];
    
    for (const page of pagesArray) {
      // Skip if page doesn't have markdown
      if (!page || !page.markdown) {
        console.warn('⚠️ Skipping page without markdown');
        continue;
      }
      
      const pageData = crawlPageSchema.parse(page);
      
      // Try to get URL from various sources
      let url = pageData.url || pageData.metadata?.url || pageData.metadata?.sourceURL;
      
      // If no URL, try to extract from markdown links
      if (!url) {
        const productUrlPattern = /\[.*?\]\((https:\/\/www\.everdrop\.de\/products\/[^)]+)\)/;
        const match = pageData.markdown.match(productUrlPattern);
        if (match && match[1]) {
          url = match[1];
        }
      }
      
      // If still no URL, try to construct from metadata title
      if (!url && pageData.metadata?.title) {
        // Extract product slug from title
        const titleMatch = pageData.metadata.title.match(/^(.+?)\s*[-–|]/);
        if (titleMatch) {
          const slug = titleMatch[1].toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[äöü]/g, (c) => ({ 'ä': 'a', 'ö': 'o', 'ü': 'u' }[c] || c));
          url = `https://www.everdrop.de/products/${slug}`;
        }
      }
      
      // Last resort - use the crawl URL + hash
      if (!url) {
        const crawlConfig = (await db.select().from(crawlJobs).where(eq(crawlJobs.id, crawlJobId)))[0]?.config as any;
        if (crawlConfig?.baseUrl && crawlConfig?.includePaths?.[0]) {
          url = `${crawlConfig.baseUrl}${crawlConfig.includePaths[0]}`;
        }
      }
      
      if (!url) {
        console.warn('⚠️ Skipping page without identifiable URL');
        console.warn('  Available data:', {
          hasMarkdown: !!pageData.markdown,
          metadataKeys: Object.keys(pageData.metadata || {}),
          markdownSnippet: pageData.markdown?.substring(0, 200)
        });
        continue;
      }
      
      console.log(`📄 Processing page: ${url}`);
    
    // Process the product
    const result = await processProduct({
      url: url,
      markdown: pageData.markdown,
      metadata: pageData.metadata,
      shopId: shopId,
    });
    
      // Update crawl job stats
      if (result.isNew) {
        // Increment new products count
        const [currentJob] = await db.select().from(crawlJobs).where(eq(crawlJobs.id, crawlJobId));
        const currentStats = currentJob?.stats as any || {};
        await db.update(crawlJobs)
          .set({
            stats: {
              ...currentStats,
              newProducts: (currentStats.newProducts || 0) + 1,
              processedPages: (currentStats.processedPages || 0) + 1
            }
          })
          .where(eq(crawlJobs.id, crawlJobId));
      } else {
        // Increment skipped products count
        const [currentJob] = await db.select().from(crawlJobs).where(eq(crawlJobs.id, crawlJobId));
        const currentStats = currentJob?.stats as any || {};
        await db.update(crawlJobs)
          .set({
            stats: {
              ...currentStats,
              skippedProducts: (currentStats.skippedProducts || 0) + 1,
              processedPages: (currentStats.processedPages || 0) + 1
            }
          })
          .where(eq(crawlJobs.id, crawlJobId));
      }
    }
    
  } catch (error) {
    console.error(`❌ Error processing page:`, error);
    
    // Log error to crawl job
    const errorEntry = {
      timestamp: new Date().toISOString(),
      url: Array.isArray(event.data) ? event.data[0]?.url : event.data?.url,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    const [currentJob] = await db.select().from(crawlJobs).where(eq(crawlJobs.id, crawlJobId));
    const currentErrorLog = (currentJob?.errorLog as any[]) || [];
    const currentStats = (currentJob?.stats as any) || {};
    
    await db.update(crawlJobs)
      .set({
        errorLog: [...currentErrorLog, errorEntry],
        stats: {
          ...currentStats,
          errors: (currentStats.errors || 0) + 1
        }
      })
      .where(eq(crawlJobs.id, crawlJobId));
  }
}

// Handle crawl completed event
async function handleCrawlCompleted(crawlJobId: string, event: any) {
  console.log(`✅ Crawl completed for job ${crawlJobId}`);
  
  const totalPages = event.data?.totalPages || 0;
  
  await db
    .update(crawlJobs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      stats: {
        totalPages,
      },
    })
    .where(eq(crawlJobs.id, crawlJobId));
}

// Handle crawl failed event
async function handleCrawlFailed(crawlJobId: string, event: any) {
  console.error(`❌ Crawl failed for job ${crawlJobId}:`, event.error);
  
  await db
    .update(crawlJobs)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorLog: [{
        timestamp: new Date().toISOString(),
        error: event.error || 'Crawl failed',
      }],
    })
    .where(eq(crawlJobs.id, crawlJobId));
}

export { router as webhookRouter };