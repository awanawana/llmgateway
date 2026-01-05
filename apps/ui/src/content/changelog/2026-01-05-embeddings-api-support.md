---
id: "35"
slug: "embeddings-api-support"
date: "2026-01-05"
title: "OpenAI-Compatible Embeddings API"
summary: "Generate text embeddings with OpenAI embedding models through our new /v1/embeddings endpoint. Supports text-embedding-3-small, text-embedding-3-large, and text-embedding-ada-002."
---

We're excited to announce the **Embeddings API** - a new OpenAI-compatible endpoint for generating text embeddings. Embeddings are vector representations of text useful for semantic search, clustering, recommendations, and RAG applications.

**[Read the full documentation](https://docs.llmgateway.io/features/embeddings)** 📚

## Supported Models

| Model                    | Dimensions | Price          |
| ------------------------ | ---------- | -------------- |
| `text-embedding-3-small` | 1536       | $0.02/M tokens |
| `text-embedding-3-large` | 3072       | $0.13/M tokens |
| `text-embedding-ada-002` | 1536       | $0.10/M tokens |

## Quick Start

```bash
curl -X POST https://api.llmgateway.io/v1/embeddings \
  -H "Authorization: Bearer $LLM_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```

## Features

- **OpenAI-compatible**: Drop-in replacement for OpenAI's embeddings API
- **Multiple inputs**: Embed multiple texts in a single request
- **Dimension reduction**: Reduce output dimensions with text-embedding-3-\* models
- **Unified billing**: Same billing and logging as chat completions

---

**[Read the documentation](https://docs.llmgateway.io/features/embeddings)** 📚

**[Get started now](/signup)** 🚀
