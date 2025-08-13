# Quick Setup: Connect Windows Claude Desktop to WSL MCP Server

## Current Status
✅ **MCP Server is running** in WSL on port 3001
- WSL IP: `172.30.162.53`
- Accessible at: `http://localhost:3001` (from Windows)

## Step 1: Test Connection from Windows

Open PowerShell or Command Prompt on your Windows machine:

```powershell
# Test if the server is accessible
curl http://localhost:3001/health
```

You should see:
```json
{"status":"healthy","service":"MCP RAG Server (WSL)","timestamp":"...","accessible_from_windows":true}
```

## Step 2: Configure Claude Desktop

Since MCP in Claude Desktop doesn't support direct HTTP endpoints yet, we need to use a bridge script.

### Option A: Create a Windows Bridge Script (Recommended)

1. Create this file on Windows: `C:\Users\[YourUsername]\mcp-bridge.ps1`

```powershell
param(
    [string]$method = "search",
    [string]$query = "",
    [string]$filters = "{}"
)

$body = @{
    query = $query
    filters = ($filters | ConvertFrom-Json)
    limit = 10
    searchType = "hybrid"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/$method" -Method POST -Body $body -ContentType "application/json"
Write-Output ($response | ConvertTo-Json -Depth 10)
```

2. Add to Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "command": "powershell",
      "args": ["-ExecutionPolicy", "Bypass", "-File", "C:\\Users\\[YourUsername]\\mcp-bridge.ps1"],
      "env": {}
    }
  }
}
```

### Option B: Use Node.js Bridge (If Node is installed on Windows)

1. Create `C:\Users\[YourUsername]\mcp-bridge.js`:

```javascript
const http = require('http');

const args = process.argv.slice(2);
const query = args[0] || 'test';

const data = JSON.stringify({
  query: query,
  limit: 10,
  searchType: 'hybrid'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/search',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log(responseData);
  });
});

req.on('error', (error) => {
  console.error(JSON.stringify({ error: error.message }));
});

req.write(data);
req.end();
```

2. Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "command": "node",
      "args": ["C:\\Users\\[YourUsername]\\mcp-bridge.js"],
      "env": {}
    }
  }
}
```

## Step 3: Keep Server Running in WSL

The server is currently running. To keep it running permanently:

### Quick Start (Manual)
```bash
# In WSL
cd /home/konstantin/projects/m42-shop-etl
npm run mcp:server
```

### Auto-start with PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start npm --name "mcp-server" -- run mcp:server

# Save PM2 configuration
pm2 save
pm2 startup

# View logs
pm2 logs mcp-server
```

## Testing the Integration

### From Windows Browser
Open: http://localhost:3001/health

### From Windows PowerShell
```powershell
# Test search
$body = @{
    query = "umweltfreundliche Reinigungsmittel"
    limit = 5
    searchType = "hybrid"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/search" -Method POST -Body $body -ContentType "application/json"
```

### Using the Web Client
Open in Windows browser:
```
file://wsl$/Ubuntu/home/konstantin/projects/m42-shop-etl/examples/mcp-client.html
```

Or copy the file to Windows:
```powershell
# In PowerShell
Copy-Item "\\wsl$\Ubuntu\home\konstantin\projects\m42-shop-etl\examples\mcp-client.html" "C:\Users\[YourUsername]\Desktop\mcp-client.html"
```

## Current Access Points

The MCP server is accessible at:
- **From Windows**: `http://localhost:3001`
- **Direct WSL IP**: `http://172.30.162.53:3001`
- **Health Check**: `http://localhost:3001/health`
- **Search API**: `POST http://localhost:3001/search`
- **Streaming**: `GET http://localhost:3001/stream?query=YOUR_QUERY`

## Available Endpoints

### Search Products
```http
POST http://localhost:3001/search
Content-Type: application/json

{
  "query": "vegane Produkte",
  "filters": {
    "priceRange": [0, 20],
    "categories": ["Reinigungsmittel"]
  },
  "limit": 10,
  "searchType": "hybrid"
}
```

### Stream Response
```http
GET http://localhost:3001/stream?query=nachhaltige%20Reiniger
```

## Troubleshooting

### Can't connect from Windows?

1. Check if port is forwarded:
```powershell
netsh interface portproxy show all
```

2. Add Windows Firewall rule:
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "WSL MCP Server" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

3. Check WSL IP changed:
```bash
# In WSL
hostname -I
```

### Server stopped?

Check status in WSL:
```bash
# Check if running
curl http://localhost:3001/health

# Restart if needed
npm run mcp:server
```

## Summary

1. ✅ Server is running in WSL at `http://localhost:3001`
2. ✅ Accessible from Windows
3. ✅ Ready for Claude Desktop integration
4. 📝 Use bridge script for Claude Desktop connection

The server provides semantic product search with RAG capabilities for all your e-commerce data!