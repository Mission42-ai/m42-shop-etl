import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Environment variable schema
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  
  // APIs
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  FIRECRAWL_API_KEY: z.string().startsWith('fc-'),
  
  // Webhook & Server
  WEBHOOK_URL: z.string().url().optional(),
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Embedding Config
  EMBED_MODEL: z.string().default('text-embedding-3-small'),
  EMBED_DIM: z.string().transform(Number).default('1536'),
  
  // LLM Config
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  DEFAULT_LOCALE: z.string().default('de-DE'),
  
  // Optional Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  
  // Optional Redis
  REDIS_URL: z.string().url().optional(),
});

// Parse and validate environment variables
const envResult = envSchema.safeParse(process.env);

if (!envResult.success) {
  console.error('❌ Invalid environment variables:');
  console.error(envResult.error.format());
  process.exit(1);
}

export const config = envResult.data;

// Export typed config sections
export const dbConfig = {
  url: config.DATABASE_URL,
};

export const apiConfig = {
  openai: {
    apiKey: config.OPENAI_API_KEY,
    embedModel: config.EMBED_MODEL,
    embedDim: config.EMBED_DIM,
    llmModel: config.LLM_MODEL,
  },
  firecrawl: {
    apiKey: config.FIRECRAWL_API_KEY,
  },
};

export const serverConfig = {
  port: config.PORT,
  webhookUrl: config.WEBHOOK_URL,
  nodeEnv: config.NODE_ENV,
};

export const localeConfig = {
  defaultLocale: config.DEFAULT_LOCALE,
};

// Optional configs
export const supabaseConfig = config.SUPABASE_URL && config.SUPABASE_ANON_KEY ? {
  url: config.SUPABASE_URL,
  anonKey: config.SUPABASE_ANON_KEY,
} : null;

export const redisConfig = config.REDIS_URL ? {
  url: config.REDIS_URL,
} : null;