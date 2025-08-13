# Running MCP Server on WSL for Windows Claude Desktop

## Architecture Overview
- **MCP Server**: Runs in WSL (Ubuntu/Linux)
- **Claude Desktop**: Runs on Windows
- **Connection**: Via localhost port forwarding or WSL IP

## Method 1: Keep Server Running in WSL (Recommended)

### Step 1: Start the MCP Server in WSL

```bash
# In WSL terminal
cd /home/konstantin/projects/m42-shop-etl

# Start the server and keep it running
npm run mcp:server

# Or run it in the background with nohup
nohup npm run mcp:server > mcp-server.log 2>&1 &

# Or use tmux/screen for persistent session
tmux new -s mcp-server
npm run mcp:server
# Press Ctrl+B then D to detach
```

### Step 2: Find Your WSL IP Address

```bash
# In WSL
hostname -I
# Example output: 172.29.208.123
```

### Step 3: Test Connection from Windows

Open PowerShell or Command Prompt on Windows:

```powershell
# Test if server is accessible
curl http://localhost:3001/health

# Or use WSL IP directly
curl http://172.29.208.123:3001/health
```

### Step 4: Configure Claude Desktop on Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", "{REQUEST_BODY}",
        "http://localhost:3001/search"
      ]
    }
  }
}
```

## Method 2: Use PM2 Process Manager (Production Ready)

### Install PM2 in WSL

```bash
npm install -g pm2
```

### Create PM2 Configuration

```bash
# Create pm2.config.js
cat > /home/konstantin/projects/m42-shop-etl/pm2.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'mcp-server',
    script: 'npx',
    args: 'tsx src/mcp/server-standalone.ts',
    cwd: '/home/konstantin/projects/m42-shop-etl',
    env: {
      NODE_ENV: 'production',
      MCP_PORT: '3001'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF
```

### Start with PM2

```bash
# Start the server
pm2 start pm2.config.js

# View logs
pm2 logs mcp-server

# Monitor
pm2 monit

# Save PM2 configuration for auto-start
pm2 save
pm2 startup
```

## Method 3: WSL Systemd Service (Auto-start)

If your WSL supports systemd:

```bash
# Create service file
sudo nano /etc/systemd/system/mcp-server.service
```

Add this content:

```ini
[Unit]
Description=MCP RAG Server
After=network.target

[Service]
Type=simple
User=konstantin
WorkingDirectory=/home/konstantin/projects/m42-shop-etl
ExecStart=/usr/bin/npm run mcp:server
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable mcp-server
sudo systemctl start mcp-server
sudo systemctl status mcp-server
```

## Method 4: Windows Port Forwarding (WSL2)

WSL2 should automatically forward ports, but if not:

### Enable Port Forwarding

Create `.wslconfig` in your Windows user directory:

```ini
[wsl2]
localhostForwarding=true
```

### Manual Port Forwarding (if needed)

In Windows PowerShell (Admin):

```powershell
# Get WSL IP
wsl hostname -I

# Add port forwarding rule
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=172.29.208.123

# Check rules
netsh interface portproxy show all

# Remove rule (if needed)
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
```

## Testing the Setup

### 1. From WSL

```bash
# Check if server is running
curl http://localhost:3001/health
```

### 2. From Windows

Open browser or PowerShell:

```powershell
# Using PowerShell
Invoke-WebRequest -Uri "http://localhost:3001/health" | ConvertFrom-Json

# Or test search
$body = @{
    query = "umweltfreundliche Reinigungsmittel"
    limit = 5
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/search" -Method POST -Body $body -ContentType "application/json"
```

### 3. From Browser

Open in Windows browser:
- http://localhost:3001/health
- file:///\\wsl$\Ubuntu\home\konstantin\projects\m42-shop-etl\examples\mcp-client.html

## Simplified Claude Desktop Config

Since the server is always running, you can use a simple HTTP client approach:

```json
{
  "mcpServers": {
    "m42-shop-rag": {
      "baseUrl": "http://localhost:3001",
      "type": "http",
      "tools": ["product_search", "compare_products", "get_product_details"]
    }
  }
}
```

## Monitoring & Logs

### View Server Logs

```bash
# If using PM2
pm2 logs mcp-server

# If using nohup
tail -f mcp-server.log

# If using systemd
sudo journalctl -u mcp-server -f
```

### Check Server Status

```bash
# Check if port is listening
sudo netstat -tlnp | grep 3001

# Check process
ps aux | grep mcp-server
```

## Troubleshooting

### Issue: Can't connect from Windows

1. Check WSL firewall:
```bash
sudo ufw status
# If active, allow port
sudo ufw allow 3001
```

2. Check Windows firewall:
```powershell
# In Windows PowerShell (Admin)
New-NetFirewallRule -DisplayName "MCP Server" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

### Issue: Server stops when closing WSL terminal

Use one of these solutions:
- PM2 (recommended)
- tmux/screen
- systemd service
- nohup with background process

### Issue: Port already in use

```bash
# Find process using port
sudo lsof -i :3001
# Kill it if needed
kill -9 <PID>
```

## Quick Start Script

Create `start-mcp.sh`:

```bash
#!/bin/bash
cd /home/konstantin/projects/m42-shop-etl

# Check if already running
if lsof -i:3001 > /dev/null 2>&1; then
    echo "✅ MCP Server already running on port 3001"
else
    echo "🚀 Starting MCP Server..."
    nohup npm run mcp:server > mcp-server.log 2>&1 &
    sleep 3
    
    if lsof -i:3001 > /dev/null 2>&1; then
        echo "✅ MCP Server started successfully"
        echo "📋 Logs: tail -f mcp-server.log"
    else
        echo "❌ Failed to start MCP Server"
        tail -20 mcp-server.log
    fi
fi

# Show access URLs
echo ""
echo "📍 Access URLs:"
echo "   From WSL: http://localhost:3001/health"
echo "   From Windows: http://localhost:3001/health"
WSL_IP=$(hostname -I | awk '{print $1}')
echo "   Direct IP: http://$WSL_IP:3001/health"
```

Make it executable:
```bash
chmod +x start-mcp.sh
./start-mcp.sh
```

## Summary

The easiest approach:
1. Start server in WSL with PM2 or nohup
2. Keep it running in background
3. Access from Windows via `http://localhost:3001`
4. Configure Claude Desktop to use the HTTP endpoint

This way, the server is always available when you need it!