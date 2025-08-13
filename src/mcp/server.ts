import express, { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import OpenAI from 'openai';
import { vectorSearch, hybridSearch, SearchResult } from '../rag/vectorSearch.js';
import { apiConfig } from '../config/index.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.MCP_PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: apiConfig.openai.apiKey,
});

// Middleware
app.use(cors());
app.use(express.json());

// Request schemas
const searchRequestSchema = z.object({
  query: z.string().min(1),
  stream: z.boolean().optional().default(false),
  filters: z.object({
    shopId: z.string().optional(),
    priceRange: z.tuple([z.number(), z.number()]).optional(),
    categories: z.array(z.string()).optional(),
    brands: z.array(z.string()).optional(),
    availability: z.array(z.string()).optional(),
    productTypes: z.array(z.string()).optional(),
  }).optional(),
  limit: z.number().optional().default(10),
  searchType: z.enum(['vector', 'hybrid', 'keyword']).optional().default('hybrid'),
  includeChunks: z.boolean().optional().default(true),
  rerank: z.boolean().optional().default(true),
});

const compareRequestSchema = z.object({
  productIds: z.array(z.string()).min(2).max(5),
  attributes: z.array(z.string()).optional(),
});

// MCP Tool definitions
const mcpTools = [
  {
    name: 'product_search',
    description: 'Search for products using semantic similarity and filters',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        filters: { 
          type: 'object',
          properties: {
            priceRange: { type: 'array', items: { type: 'number' } },
            categories: { type: 'array', items: { type: 'string' } },
            brands: { type: 'array', items: { type: 'string' } },
          }
        },
        limit: { type: 'number', description: 'Number of results' }
      },
      required: ['query']
    }
  },
  {
    name: 'compare_products',
    description: 'Compare multiple products side by side',
    parameters: {
      type: 'object',
      properties: {
        productIds: { 
          type: 'array', 
          items: { type: 'string' },
          minItems: 2,
          maxItems: 5
        },
        attributes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific attributes to compare'
        }
      },
      required: ['productIds']
    }
  },
  {
    name: 'get_product_details',
    description: 'Get detailed information about a specific product',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' }
      },
      required: ['productId']
    }
  }
];

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'MCP RAG Server',
    timestamp: new Date().toISOString() 
  });
});

// List available tools
app.get('/tools', (req: Request, res: Response) => {
  res.json({ tools: mcpTools });
});

// Main search endpoint
app.post('/search', async (req: Request, res: Response) => {
  try {
    const params = searchRequestSchema.parse(req.body);
    
    console.log(`🔍 Search request: ${params.query}`);
    
    // If streaming is requested, use SSE
    if (params.stream) {
      return handleStreamingSearch(params, res);
    }
    
    // Regular non-streaming search
    const results = await performSearch(params);
    const response = await generateResponse(params.query, results);
    
    res.json({
      query: params.query,
      results,
      response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Search error:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Invalid request', 
        details: error.errors 
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Server-Sent Events endpoint for streaming
app.get('/stream', async (req: Request, res: Response) => {
  const { query, filters, limit, searchType } = req.query;
  
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query parameter is required' });
    return;
  }
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable Nginx buffering
  });
  
  try {
    // Send initial event
    sendSSE(res, 'search_started', { query, timestamp: new Date().toISOString() });
    
    // Perform search
    const params = {
      query,
      filters: filters ? JSON.parse(filters as string) : undefined,
      limit: limit ? parseInt(limit as string) : 10,
      searchType: (searchType as 'vector' | 'hybrid' | 'keyword') || 'hybrid',
      includeChunks: true,
      rerank: true,
      stream: false
    };
    
    const results = await performSearch(params);
    
    // Send chunks retrieved event
    sendSSE(res, 'chunks_retrieved', {
      count: results.length,
      sources: results.map(r => r.url)
    });
    
    // Generate streaming response
    await streamResponse(query, results, res);
    
    // Send completion event
    sendSSE(res, 'complete', { 
      timestamp: new Date().toISOString(),
      resultsCount: results.length
    });
    
    res.end();
    
  } catch (error) {
    console.error('❌ Streaming error:', error);
    sendSSE(res, 'error', { 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
    res.end();
  }
});

// Compare products endpoint
app.post('/compare', async (req: Request, res: Response) => {
  try {
    const params = compareRequestSchema.parse(req.body);
    
    // Fetch product details for comparison
    const comparisonData = await compareProducts(params.productIds, params.attributes);
    
    res.json({
      productIds: params.productIds,
      comparison: comparisonData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Comparison error:', error);
    res.status(500).json({ 
      error: 'Comparison failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to perform search
async function performSearch(params: z.infer<typeof searchRequestSchema>): Promise<SearchResult[]> {
  const searchOptions = {
    query: params.query,
    limit: params.limit,
    filters: params.filters,
    includeChunks: params.includeChunks,
    rerank: params.rerank
  };
  
  switch (params.searchType) {
    case 'vector':
      return await vectorSearch(searchOptions);
    case 'hybrid':
      return await hybridSearch(searchOptions);
    default:
      return await hybridSearch(searchOptions);
  }
}

// Generate response using LLM
async function generateResponse(query: string, results: SearchResult[]): Promise<string> {
  if (results.length === 0) {
    return `Leider konnte ich keine passenden Produkte für "${query}" finden. Bitte versuchen Sie es mit anderen Suchbegriffen.`;
  }
  
  const context = formatSearchContext(results);
  
  const systemPrompt = `Du bist ein hilfreicher Assistent für einen E-Commerce-Shop. 
Beantworte Fragen basierend auf den gefundenen Produkten.
Sei präzise und hilfreich. Verwende die Produktinformationen aus dem Kontext.
Gib immer die Quelle (Produktname und URL) an, wenn du spezifische Informationen nennst.`;
  
  const userPrompt = `Frage: ${query}

Gefundene Produkte:
${context}

Bitte beantworte die Frage basierend auf den gefundenen Produkten.`;
  
  const response = await openai.chat.completions.create({
    model: apiConfig.openai.llmModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 500
  });
  
  return response.choices[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.';
}

// Format search results as context
function formatSearchContext(results: SearchResult[]): string {
  return results.map((result, idx) => `
${idx + 1}. ${result.name}
   URL: ${result.url}
   Preis: ${result.price ? `€${result.price}` : 'Nicht verfügbar'}
   Marke: ${result.brand || 'Nicht angegeben'}
   Kategorie: ${result.category || 'Nicht angegeben'}
   Beschreibung: ${result.description || 'Keine Beschreibung verfügbar'}
   ${result.metadata.claims?.length ? `Claims: ${result.metadata.claims.join(', ')}` : ''}
   ${result.metadata.rating ? `Bewertung: ${result.metadata.rating.value}/5 (${result.metadata.rating.count} Bewertungen)` : ''}
   Relevanz-Score: ${(result.similarity * 100).toFixed(1)}%
`).join('\n');
}

// Stream response using SSE
async function streamResponse(query: string, results: SearchResult[], res: Response) {
  if (results.length === 0) {
    sendSSE(res, 'token', { 
      content: `Leider konnte ich keine passenden Produkte für "${query}" finden.` 
    });
    return;
  }
  
  const context = formatSearchContext(results);
  
  const systemPrompt = `Du bist ein hilfreicher Assistent für einen E-Commerce-Shop. 
Beantworte Fragen basierend auf den gefundenen Produkten.
Sei präzise und hilfreich. Verwende die Produktinformationen aus dem Kontext.
Gib immer die Quelle (Produktname) an, wenn du spezifische Informationen nennst.`;
  
  const stream = await openai.chat.completions.create({
    model: apiConfig.openai.llmModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Frage: ${query}\n\nGefundene Produkte:\n${context}` }
    ],
    temperature: 0.3,
    max_tokens: 500,
    stream: true
  });
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      sendSSE(res, 'token', { content });
    }
  }
  
  // Send citations
  for (const result of results.slice(0, 3)) {
    sendSSE(res, 'citation', {
      source: result.name,
      url: result.url,
      relevance: result.similarity
    });
  }
}

// Send SSE event
function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Compare products helper
async function compareProducts(productIds: string[], attributes?: string[]) {
  // This would fetch products from database and create comparison
  // For now, returning mock data structure
  return {
    attributes: attributes || ['price', 'brand', 'category', 'claims', 'rating'],
    products: productIds.map(id => ({
      id,
      // Would fetch actual data from DB
      data: {
        price: Math.random() * 50,
        brand: 'everdrop',
        category: 'Reinigungsmittel',
        claims: ['Vegan', 'Ohne Mikroplastik'],
        rating: 4.5
      }
    }))
  };
}

// Handle streaming search
async function handleStreamingSearch(params: z.infer<typeof searchRequestSchema>, res: Response) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  try {
    sendSSE(res, 'search_started', { 
      query: params.query, 
      timestamp: new Date().toISOString() 
    });
    
    const results = await performSearch(params);
    
    sendSSE(res, 'chunks_retrieved', {
      count: results.length,
      sources: results.map(r => r.url)
    });
    
    await streamResponse(params.query, results, res);
    
    sendSSE(res, 'complete', { 
      timestamp: new Date().toISOString(),
      resultsCount: results.length
    });
    
  } catch (error) {
    sendSSE(res, 'error', { 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  } finally {
    res.end();
  }
}

// Start server
app.listen(port, () => {
  console.log(`🚀 MCP RAG Server running at http://localhost:${port}`);
  console.log(`📍 Endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /tools - List available MCP tools`);
  console.log(`   POST /search - Search products (with optional streaming)`);
  console.log(`   GET  /stream - SSE streaming endpoint`);
  console.log(`   POST /compare - Compare products`);
});