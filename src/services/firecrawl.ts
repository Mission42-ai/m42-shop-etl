import { apiConfig, serverConfig } from '../config/index.js';
import { z } from 'zod';

const FIRECRAWL_API_BASE = 'https://api.firecrawl.dev/v1';

// Schemas for Firecrawl API responses
const crawlJobResponseSchema = z.object({
  success: z.boolean(),
  id: z.string(),  // v1 API uses 'id' instead of 'jobId'
  url: z.string().optional(),
});

const crawlStatusResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(['active', 'paused', 'completed', 'failed', 'scraping']),
  current: z.number().optional(),
  total: z.number().optional(),
  data: z.array(z.any()).optional(),
  partial_data: z.array(z.any()).optional(),
});

export interface CrawlJobConfig {
  baseUrl: string;
  includePaths: string[];
  excludePaths?: string[];
  limit?: number;
  maxDepth?: number;
  webhookUrl?: string;
}

export class FirecrawlService {
  private apiKey: string;
  
  constructor() {
    this.apiKey = apiConfig.firecrawl.apiKey;
  }
  
  /**
   * Start a new crawl job
   */
  async startCrawl(config: CrawlJobConfig): Promise<string> {
    try {
      // Build includes and excludes patterns
      const includes = config.includePaths.map(path => `${config.baseUrl}${path}/**`);
      const excludes = config.excludePaths?.map(path => `${config.baseUrl}${path}/**`) || [];
      
      // For v1 API, we need to adjust the URL to include the path
      // Since Firecrawl v1 doesn't support includes/excludes, we'll crawl from the products page
      const crawlUrl = config.includePaths.length > 0 
        ? `${config.baseUrl}${config.includePaths[0]}`
        : config.baseUrl;
      
      const requestBody = {
        url: crawlUrl,
        limit: config.limit || 1000,
        scrapeOptions: {
          formats: ['markdown', 'html'],
        },
        ...(config.webhookUrl && {
          webhook: config.webhookUrl,
        }),
      };
      
      console.log('🔥 Starting Firecrawl job with config:', {
        url: crawlUrl,
        limit: config.limit,
        webhook: config.webhookUrl,
      });
      
      const response = await fetch(`${FIRECRAWL_API_BASE}/crawl`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const result = crawlJobResponseSchema.parse(data);
      
      if (!result.success || !result.id) {
        throw new Error('Failed to start crawl job');
      }
      
      console.log(`✅ Crawl job started with ID: ${result.id}`);
      return result.id;
      
    } catch (error) {
      console.error('Error starting crawl:', error);
      throw error;
    }
  }
  
  /**
   * Get the status of a crawl job
   */
  async getCrawlStatus(jobId: string) {
    try {
      const response = await fetch(`${FIRECRAWL_API_BASE}/crawl/status/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      return crawlStatusResponseSchema.parse(data);
      
    } catch (error) {
      console.error('Error getting crawl status:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a running crawl job
   */
  async cancelCrawl(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(`${FIRECRAWL_API_BASE}/crawl/cancel/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to cancel crawl: ${response.status} - ${errorText}`);
        return false;
      }
      
      console.log(`✅ Crawl job ${jobId} cancelled`);
      return true;
      
    } catch (error) {
      console.error('Error cancelling crawl:', error);
      return false;
    }
  }
  
  /**
   * Scrape a single URL (useful for testing)
   */
  async scrapeSingle(url: string) {
    try {
      const response = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to scrape URL');
      }
      
      return {
        url: data.data?.url || url,
        markdown: data.data?.markdown || '',
        html: data.data?.html || '',
        metadata: data.data?.metadata || {},
      };
      
    } catch (error) {
      console.error('Error scraping single URL:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const firecrawl = new FirecrawlService();