# TYPO3 v13.4 RAG MCP Server

A Retrieval-Augmented Generation (RAG) system designed to provide semantic search capabilities for TYPO3 CMS v13.4 documentation. This project is implemented as a Model Context Protocol (MCP) server, allowing AI agents (like Pi or Claude) to interact with the documentation via a structured tool interface.

## Project Overview

- **Core Functionality:** Semantic search across TYPO3 v13.4 documentation using a "Small-to-Big" retrieval strategy.
- **Retrieval Strategy:**
    - **Small (Child Chunks):** Small text passages (paragraphs/sentences) are embedded for high-precision vector search.
    - **Big (Parent Documents):** Full sections/chapters associated with the child chunks are returned to the agent to provide maximum context for answer generation.
- **Technologies:**
    - **Runtime:** Node.js (ES Modules)
    - **Language:** TypeScript
    - **Vector DB:** [LanceDB](https://lancedb.com/) (Local, serverless vector database).
    - **Embeddings:** [Transformers.js](https://huggingface.co/docs/transformers.js) using the `Xenova/bge-small-en-v1.5` model (runs locally).
    - **Protocol:** [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

## MCP Server setup

```javascript
{
    "mcpServers": {
        "typo3-docs": {
            "command": "node",
            "args": [
                "/path/to/typo3-docu-rag/dist/index.js"
            ],
            "env": {
                "NODE_ENV": "Production"
            },
            "lifecycle": "lazy",
            "directTools": true
        }
    }
}
```

See GEMINI.md for more details/commands