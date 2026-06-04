-- Create HNSW index on email_messages.embedding for fast semantic search
-- pgvector v0.8.0+ supports HNSW indexes
-- This index uses cosine similarity (vector_cosine_ops)

CREATE INDEX IF NOT EXISTS idx_email_messages_embedding_hnsw 
ON "email_messages" USING hnsw (embedding vector_cosine_ops);
