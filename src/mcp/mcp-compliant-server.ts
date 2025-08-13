import express, { Request, Response } from 'express';
import cors from 'cors';
import { vectorSearch, hybridSearch } from '../rag/vectorSearch.js';
import { apiConfig } from '../config/index.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.MCP_PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: apiConfig.openai.apiKey,
});

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.text());

// MCP Protocol Implementation
const mcpTools = {
  'product_search': {
    description: 'Search for products using semantic similarity and filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Search query'
        },
        filters: { 
          type: 'object',
          properties: {
            priceRange: { 
              type: 'array', 
              items: { type: 'number' },
              description: 'Min and max price'
            },
            categories: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Product categories'
            },
            brands: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Product brands'
            },
            availability: {
              type: 'array',
              items: { type: 'string' },
              description: 'Availability status'
            }
          }
        },
        limit: { 
          type: 'number', 
          description: 'Number of results',
          default: 10
        },
        searchType: {
          type: 'string',
          enum: ['vector', 'hybrid', 'keyword'],
          default: 'hybrid'
        }
      },
      required: ['query']
    }
  },
  'compare_products': {
    description: 'Compare multiple products side by side',
    inputSchema: {
      type: 'object',
      properties: {
        productIds: { 
          type: 'array', 
          items: { type: 'string' },
          minItems: 2,
          maxItems: 5,
          description: 'Product IDs to compare'
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
  'get_product_details': {
    description: 'Get detailed information about a specific product',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { 
          type: 'string', 
          description: 'Product ID' 
        }
      },
      required: ['productId']
    }
  }
};

// MCP Stream endpoint - this is what n8n MCP Client expects
app.post('/stream', async (req: Request, res: Response) => {
  console.log('📨 MCP Stream request received');
  
  // Set SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  try {
    // Parse MCP request
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('📦 Request body:', JSON.stringify(body, null, 2));
    
    // Handle different MCP message types
    if (body.method === 'initialize') {
      // Initialize handshake
      const response = {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          prompts: {},
          resources: {}
        },
        serverInfo: {
          name: 'm42-shop-rag',
          version: '1.0.0'
        }
      };
      
      sendMCPResponse(res, 'initialize', response);
      
    } else if (body.method === 'tools/list') {
      // List available tools
      const tools = Object.entries(mcpTools).map(([name, config]) => ({
        name,
        description: config.description,
        inputSchema: config.inputSchema
      }));
      
      sendMCPResponse(res, 'tools/list', { tools });
      
    } else if (body.method === 'tools/call') {
      // Execute tool
      const { name, arguments: args } = body.params;
      console.log(`🔧 Executing tool: ${name}`, args);
      
      if (name === 'product_search') {
        await handleProductSearch(res, args);
      } else if (name === 'compare_products') {
        await handleCompareProducts(res, args);
      } else if (name === 'get_product_details') {
        await handleGetProductDetails(res, args);
      } else {
        sendMCPError(res, `Unknown tool: ${name}`);
      }
      
    } else {
      // Unknown method
      sendMCPError(res, `Unknown method: ${body.method}`);
    }
    
  } catch (error) {
    console.error('❌ MCP Stream error:', error);
    sendMCPError(res, error instanceof Error ? error.message : 'Unknown error');
  }
  
  res.end();
});

// Alternative SSE endpoint for GET requests
app.get('/stream', async (req: Request, res: Response) => {
  const { query, filters, limit, searchType } = req.query;
  
  if (!query) {
    res.status(400).json({ error: 'Query parameter is required' });
    return;
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const searchParams = {
      query: query as string,
      filters: filters ? JSON.parse(filters as string) : undefined,
      limit: limit ? parseInt(limit as string) : 10,
      searchType: (searchType as 'vector' | 'hybrid' | 'keyword') || 'hybrid',
      includeChunks: true,
      rerank: true
    };
    
    await handleProductSearch(res, searchParams);
    
  } catch (error) {
    sendMCPError(res, error instanceof Error ? error.message : 'Unknown error');
  }
  
  res.end();
});

// Helper function to send MCP response
function sendMCPResponse(res: Response, _method: string, result: any) {
  const response = {
    jsonrpc: '2.0',
    id: Date.now(),
    result
  };
  
  res.write(`data: ${JSON.stringify(response)}\n\n`);
}

// Helper function to send MCP error
function sendMCPError(res: Response, message: string) {
  const response = {
    jsonrpc: '2.0',
    id: Date.now(),
    error: {
      code: -32603,
      message
    }
  };
  
  res.write(`data: ${JSON.stringify(response)}\n\n`);
}

// Handle product search tool
async function handleProductSearch(res: Response, args: any) {
  try {
    const searchOptions = {
      query: args.query,
      limit: args.limit || 10,
      filters: args.filters,
      includeChunks: true,
      rerank: true
    };
    
    let results;
    if (args.searchType === 'vector') {
      results = await vectorSearch(searchOptions);
    } else {
      results = await hybridSearch(searchOptions);
    }
    
    // Generate AI response
    const aiResponse = await generateResponse(args.query, results);
    
    // Format response for MCP
    const toolResult = {
      content: [
        {
          type: 'text',
          text: aiResponse
        }
      ],
      isError: false,
      metadata: {
        resultsCount: results.length,
        products: results.map(r => ({
          name: r.name,
          price: r.price,
          url: r.url,
          similarity: r.similarity
        }))
      }
    };
    
    sendMCPResponse(res, 'tools/call', toolResult);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    sendMCPError(res, error instanceof Error ? error.message : 'Search failed');
  }
}

// Handle compare products tool
async function handleCompareProducts(res: Response, args: any) {
  // Mock implementation - you can expand this
  const comparison = {
    content: [
      {
        type: 'text',
        text: `Comparing ${args.productIds.length} products...`
      }
    ],
    isError: false
  };
  
  sendMCPResponse(res, 'tools/call', comparison);
}

// Handle get product details tool
async function handleGetProductDetails(res: Response, args: any) {
  // Mock implementation - you can expand this
  const details = {
    content: [
      {
        type: 'text',
        text: `Product details for ID: ${args.productId}`
      }
    ],
    isError: false
  };
  
  sendMCPResponse(res, 'tools/call', details);
}

// Generate AI response
async function generateResponse(query: string, results: any[]): Promise<string> {
  if (results.length === 0) {
    return `Keine passenden Produkte für "${query}" gefunden.`;
  }
  
  const context = results.map((r, idx) => 
    `${idx + 1}. ${r.name} - €${r.price || 'N/A'} - ${r.brand || 'N/A'}`
  ).join('\n');
  
  const response = await openai.chat.completions.create({
    model: apiConfig.openai.llmModel,
    messages: [
      {
        role: 'system',
        content: 'Du bist ein hilfreicher E-Commerce Assistent. Beantworte kurz und präzise.'
      },
      {
        role: 'user',
        content: `Suche: ${query}\n\nGefundene Produkte:\n${context}\n\nBeschreibe die Suchergebnisse.`
      }
    ],
    temperature: 0.3,
    max_tokens: 300
  });
  
  return response.choices[0]?.message?.content || 'Keine Antwort verfügbar.';
}

// Regular search endpoint (non-MCP)
app.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, filters, limit = 10, searchType = 'hybrid' } = req.body;
    
    const searchOptions = {
      query,
      limit,
      filters,
      includeChunks: true,
      rerank: true
    };
    
    let results;
    if (searchType === 'vector') {
      results = await vectorSearch(searchOptions);
    } else {
      results = await hybridSearch(searchOptions);
    }
    
    const aiResponse = await generateResponse(query, results);
    
    res.json({
      query,
      results,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Search failed' 
    });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    service: 'MCP Compliant Server',
    endpoints: {
      mcp: 'POST /stream',
      search: 'POST /search',
      health: 'GET /health'
    }
  });
});

// Start server
const host = '0.0.0.0';
app.listen(Number(port), host, () => {
  console.log(`🚀 MCP Compliant Server running at http://${host}:${port}`);
  console.log(`📡 MCP Stream endpoint: POST http://${host}:${port}/stream`);
  console.log(`🔍 Regular search: POST http://${host}:${port}/search`);
  console.log(`❤️ Health check: GET http://${host}:${port}/health`);
});