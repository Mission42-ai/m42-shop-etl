# M42 Shop ETL Pipeline

A robust ETL (Extract, Transform, Load) pipeline for extracting product data from online shops, processing it with LLMs, and storing it with vector embeddings for RAG applications.

## Features

- 🔥 **Firecrawl Integration**: Automated web crawling with webhook support
- 🤖 **LLM Extraction**: Structured data extraction using OpenAI GPT-4o-mini
- 🔢 **Vector Embeddings**: Product chunking and embedding generation for semantic search
- 🗄️ **PostgreSQL + pgvector**: Scalable storage with vector similarity search
- 🎯 **Type-Safe**: Full TypeScript with Drizzle ORM
- 🌐 **Multi-Shop Support**: Works with any e-commerce site (fashion, furniture, electronics, etc.)

## Architecture

```
Shop URL → Firecrawl → Webhook → LLM Extract → Chunk → Embed → Store
```

## Prerequisites

- Node.js 18+
- PostgreSQL with pgvector extension
- OpenAI API key
- Firecrawl API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/m42-shop-etl.git
cd m42-shop-etl
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and database URL
```

4. Set up the database:
```bash
# Push the schema to your database
npm run db:push

# Enable pgvector extension (run in psql)
CREATE EXTENSION IF NOT EXISTS vector;
```

## Usage

### 1. Start the Webhook Server

First, start the webhook server to receive Firecrawl events:

```bash
npm run webhook
```

The server will start on port 3000 (or the port specified in .env).

### 2. Start a Crawl Job

In a new terminal, start a crawl job for a shop:

```bash
# Basic usage
npm run crawl <shop-name> <base-url> <include-path1> [include-path2] ...

# Examples
npm run crawl example-shop https://example-shop.com /products /artikel

# With options
CRAWL_LIMIT=500 SHOP_TYPE=fashion npm run crawl fashion-store https://fashion.com /products
```

Options:
- `CRAWL_LIMIT`: Maximum pages to crawl (default: 1000)
- `CRAWL_DEPTH`: Maximum crawl depth (default: 3)
- `SHOP_TYPE`: Type of shop (fashion, furniture, electronics, etc.)

### 3. Monitor Progress

The webhook server will log progress as products are discovered and processed:
- 📄 Processing page
- 💾 Saved product
- ✅ Created chunks with embeddings

## Database Schema

### Main Tables

- `shops`: Store information
- `products`: Product data with all extracted fields
- `product_chunks`: Vectorized content chunks for semantic search
- `crawl_jobs`: Crawl job tracking and statistics

## API Endpoints

### Health Check
```
GET /health
```

### Webhook Endpoint
```
POST /webhook/firecrawl
```

## Development

### Run in Development Mode
```bash
npm run dev
```

### Database Management
```bash
# Generate migrations
npm run db:generate

# Push schema changes
npm run db:push

# Open Drizzle Studio (DB GUI)
npm run db:studio
```

### Type Checking
```bash
npm run typecheck
```

## Configuration

### Supported Product Types
- fashion
- furniture
- electronics
- food
- beauty
- sports
- toys
- books
- other

### Extracted Fields
- Core: name, description, category, tags
- Pricing: price, original price, currency, availability
- Identifiers: SKU, EAN, brand
- Flexible: claims, warnings, specifications, attributes
- Media: images, videos
- Ratings: rating value, rating count

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify pgvector extension is installed

### Crawl Not Starting
- Check Firecrawl API key is valid
- Ensure webhook server is running
- Verify the shop URL is accessible

### No Products Being Extracted
- Check OpenAI API key and credits
- Review webhook server logs for errors
- Ensure include paths match the shop's URL structure

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...

# Optional
WEBHOOK_URL=https://your-domain.com/webhook/firecrawl
PORT=3000
LLM_MODEL=gpt-4o-mini
EMBED_MODEL=text-embedding-3-small
```

## License

MIT