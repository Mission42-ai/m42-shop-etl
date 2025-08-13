-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Set search path to include extensions schema
SET search_path TO public, extensions;

-- Now run the migration file content
-- (This should be run after this script)