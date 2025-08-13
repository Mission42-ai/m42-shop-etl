# Adding M42 Shop RAG to Claude Desktop

## Quick Setup

### 1. Locate Claude Desktop Config
The Claude Desktop configuration file is located at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 2. Add MCP Server Configuration

Open the `claude_desktop_config.json` file and add this configuration:

```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "command": "npx",
      "args": ["tsx", "/home/konstantin/projects/m42-shop-etl/src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:cjc9KzX5XIHLCk3q@db.thosixfmujkyoxrsgpeq.supabase.co:5432/postgres",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "FIRECRAWL_API_KEY": "your-firecrawl-api-key-here",
        "MCP_PORT": "3001"
      }
    }
  }
}
```

**Important**: Replace `your-openai-api-key-here` with your actual OpenAI API key!

### 3. Alternative: Using Compiled JavaScript

If you prefer using the compiled version:

1. First, build the project:
```bash
cd /home/konstantin/projects/m42-shop-etl
npm run build
```

2. Then use this configuration:
```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "command": "node",
      "args": ["/home/konstantin/projects/m42-shop-etl/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:cjc9KzX5XIHLCk3q@db.thosixfmujkyoxrsgpeq.supabase.co:5432/postgres",
        "OPENAI_API_KEY": "your-openai-api-key-here",
        "MCP_PORT": "3001"
      }
    }
  }
}
```

### 4. Restart Claude Desktop
After adding the configuration, restart Claude Desktop for the changes to take effect.

## Available MCP Tools

Once configured, you'll have access to these tools in Claude Desktop:

### 🔍 product_search
Search for products using semantic similarity and filters
```
Parameters:
- query: Search query (required)
- filters: Price range, categories, brands
- limit: Number of results
```

### 📊 compare_products
Compare multiple products side by side
```
Parameters:
- productIds: Array of product IDs (2-5 products)
- attributes: Specific attributes to compare
```

### 📋 get_product_details
Get detailed information about a specific product
```
Parameters:
- productId: Product ID (required)
```

## Testing the Integration

1. Open Claude Desktop
2. Start a new conversation
3. Try these example queries:

```
"Search for environmentally friendly cleaning products under 20 euros"

"Compare the top 3 washing detergents"

"Find vegan products without microplastics"
```

## Troubleshooting

### Server Won't Start
- Check that all dependencies are installed: `npm install`
- Verify database connection: `npm run stats`
- Check OpenAI API key is valid

### No Tools Available
- Ensure the configuration is in the correct location
- Check that paths are absolute, not relative
- Restart Claude Desktop completely

### Connection Issues
- Make sure port 3001 is not in use
- Check firewall settings
- Verify DATABASE_URL is accessible

## Environment Variables

You can also create a `.env` file in the project root instead of hardcoding values:

```env
DATABASE_URL=postgresql://postgres:cjc9KzX5XIHLCk3q@db.thosixfmujkyoxrsgpeq.supabase.co:5432/postgres
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
MCP_PORT=3001
```

Then simplify the config:
```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "command": "npx",
      "args": ["tsx", "/home/konstantin/projects/m42-shop-etl/src/mcp/server.ts"],
      "cwd": "/home/konstantin/projects/m42-shop-etl"
    }
  }
}
```

## Advanced Configuration

### Custom Search Settings
You can modify default search behavior by editing `src/mcp/server.ts`:

```typescript
// Default search configuration
const defaultConfig = {
  searchType: 'hybrid',  // 'vector', 'hybrid', or 'keyword'
  vectorWeight: 0.7,     // Weight for vector search (0-1)
  keywordWeight: 0.3,    // Weight for keyword search (0-1)
  limit: 10,             // Default number of results
  includeChunks: true,   // Include relevant text chunks
  rerank: true,          // Apply MMR reranking
};
```

### Logging
Enable debug logging by adding to env:
```json
"env": {
  "DEBUG": "mcp:*",
  "LOG_LEVEL": "debug"
}
```

## Security Note

⚠️ **Never commit API keys to version control!**

Use environment variables or a secrets manager for production deployments.

## Support

For issues or questions:
- Check logs: `~/.config/Claude/logs/` (location varies by OS)
- Test server standalone: `npm run mcp:server`
- Verify with web client: Open `examples/mcp-client.html`