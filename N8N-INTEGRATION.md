# n8n Integration with M42 Shop RAG

## Endpoint Configuration

Your ngrok URL: `https://60fa525c5de5.ngrok-free.app`

## Available Endpoints

### 1. Product Search (Main Endpoint)
**URL:** `https://60fa525c5de5.ngrok-free.app/search`  
**Method:** `POST`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "query": "your search query",
  "filters": {
    "priceRange": [0, 100],
    "categories": ["Reinigungsmittel"],
    "brands": ["everdrop"],
    "availability": ["in_stock"],
    "productTypes": ["beauty"]
  },
  "limit": 10,
  "searchType": "hybrid",
  "includeChunks": true,
  "rerank": true,
  "stream": false
}
```

**Response:**
```json
{
  "query": "your search query",
  "results": [
    {
      "productId": "uuid",
      "name": "Product Name",
      "description": "Description",
      "url": "https://...",
      "price": "19.99",
      "brand": "everdrop",
      "category": "Reinigungsmittel",
      "similarity": 0.89,
      "chunks": [...],
      "metadata": {...}
    }
  ],
  "response": "AI generated response text",
  "timestamp": "2025-08-13T..."
}
```

### 2. Health Check
**URL:** `https://60fa525c5de5.ngrok-free.app/health`  
**Method:** `GET`

### 3. Streaming Search (SSE)
**URL:** `https://60fa525c5de5.ngrok-free.app/stream`  
**Method:** `GET`  
**Query Parameters:**
- `query`: Search query (required)
- `filters`: JSON string of filters
- `limit`: Number of results
- `searchType`: vector|hybrid|keyword

## n8n HTTP Request Node Setup

### Basic Configuration

1. **Add HTTP Request Node**
2. **Configure as follows:**

```
Method: POST
URL: https://60fa525c5de5.ngrok-free.app/search
Authentication: None
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "query": "{{ $json.query }}",
  "limit": {{ $json.limit || 10 }},
  "searchType": "{{ $json.searchType || 'hybrid' }}",
  "includeChunks": {{ $json.includeChunks || true }},
  "rerank": {{ $json.rerank || true }}
}
```

## n8n Workflow Examples

### Example 1: Simple Product Search

```javascript
// Set Node
{
  "query": "umweltfreundliche Reinigungsmittel",
  "limit": 5
}

// HTTP Request Node
POST https://60fa525c5de5.ngrok-free.app/search
```

### Example 2: Filtered Search

```javascript
// Set Node
{
  "query": "Waschmittel",
  "filters": {
    "priceRange": [10, 30],
    "brands": ["everdrop"],
    "availability": ["in_stock"]
  },
  "limit": 10
}

// HTTP Request Node
POST https://60fa525c5de5.ngrok-free.app/search
```

### Example 3: Process Results

```javascript
// Code Node (after HTTP Request)
const products = $input.all()[0].json.results;

return products.map(product => ({
  json: {
    name: product.name,
    price: parseFloat(product.price),
    url: product.url,
    relevance: (product.similarity * 100).toFixed(1) + '%',
    available: product.metadata.availability === 'in_stock'
  }
}));
```

## Advanced n8n Integration

### Using Function Node for Dynamic Queries

```javascript
// Function Node
const searchQuery = items[0].json.customerQuestion || "cleaning products";
const maxPrice = items[0].json.budget || 50;

return [{
  json: {
    query: searchQuery,
    filters: {
      priceRange: [0, maxPrice],
      availability: ["in_stock"]
    },
    limit: 5,
    searchType: "hybrid"
  }
}];
```

### Error Handling

```javascript
// Code Node (after HTTP Request)
if ($input.all()[0].json.error) {
  throw new Error(`Search failed: ${$input.all()[0].json.error}`);
}

const results = $input.all()[0].json.results;
if (results.length === 0) {
  return [{
    json: {
      message: "No products found",
      suggestions: "Try different search terms"
    }
  }];
}

return results;
```

### Webhook Trigger for Search API

Create a webhook in n8n that calls your search:

```javascript
// Webhook Node Response
const query = $input.all()[0].json.query;

// Call search endpoint
const searchResult = await $http.post('https://60fa525c5de5.ngrok-free.app/search', {
  body: {
    query: query,
    limit: 5
  },
  headers: {
    'Content-Type': 'application/json'
  }
});

return {
  json: searchResult
};
```

## Testing with cURL

Test your ngrok endpoint directly:

```bash
# Health check
curl https://60fa525c5de5.ngrok-free.app/health

# Search request
curl -X POST https://60fa525c5de5.ngrok-free.app/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "vegane Reinigungsmittel",
    "limit": 5,
    "searchType": "hybrid"
  }'
```

## Monitoring in n8n

Add these nodes for monitoring:

1. **Error Trigger** - Catch failures
2. **Slack/Email Node** - Alert on errors
3. **Set Node** - Log response times
4. **IF Node** - Check if results found

## Rate Limiting

If using ngrok free tier, be aware of:
- 40 requests per minute limit
- Consider adding delay nodes between requests
- Cache results when possible

## Security

For production:
1. Add API key authentication
2. Use environment variables for URLs
3. Implement rate limiting
4. Add request validation

## Troubleshooting

### Connection Refused
- Check if MCP server is running in WSL
- Verify ngrok is forwarding correctly
- Test locally first: `curl http://localhost:3001/health`

### Empty Results
- Check query spelling
- Verify products exist in database
- Review filters (might be too restrictive)

### Timeout
- Increase timeout in HTTP Request node (default 10s)
- Check OpenAI API response time
- Consider reducing result limit

## Summary

Your n8n nodes should use:
- **Endpoint**: `POST https://60fa525c5de5.ngrok-free.app/search`
- **Headers**: `Content-Type: application/json`
- **Body**: JSON with query, filters, and options
- **Response**: JSON with results array and AI response