import express, { Request, Response, NextFunction } from 'express';
import { serverConfig } from './config/index.js';
import { webhookRouter } from './routes/webhook.js';
import { checkDatabaseConnection } from './db/index.js';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const dbConnected = await checkDatabaseConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    environment: serverConfig.nodeEnv,
  });
});

// Routes
app.use('/webhook', webhookRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: serverConfig.nodeEnv === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
async function startServer() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Server will start anyway for webhook handling.');
    }

    // Start listening
    app.listen(serverConfig.port, () => {
      console.log(`🚀 Server running on port ${serverConfig.port}`);
      console.log(`📍 Webhook endpoint: http://localhost:${serverConfig.port}/webhook/firecrawl`);
      console.log(`🏥 Health check: http://localhost:${serverConfig.port}/health`);
      console.log(`🌍 Environment: ${serverConfig.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});