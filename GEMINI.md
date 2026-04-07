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

## Building and Running

### 1. Ingestion Pipeline
Before running the server, the documentation must be fetched, parsed, and indexed.

- **Fetch Docs:** Clones relevant TYPO3 documentation repositories (13.4 branches).
  ```bash
  node --loader ts-node/esm src/scripts/fetch-docs.ts
  # Or after build:
  node dist/scripts/fetch-docs.js
  ```
- **Parse Docs:** Converts reStructuredText (RST) files into hierarchical JSON sections with child chunks.
  ```bash
  node --loader ts-node/esm src/scripts/parse-docs.ts
  # Or after build:
  node dist/scripts/parse-docs.js
  ```
- **Index Docs:** Generates embeddings and builds the LanceDB vector store.
  ```bash
  node --loader ts-node/esm src/scripts/index-docs.ts
  # Or after build:
  node dist/scripts/index-docs.js
  ```

### 2. Building the Project
Compiles TypeScript to JavaScript in the `dist/` directory.
```bash
npm run build
```

### 3. Running the MCP Server
Starts the MCP server via Stdio transport.
```bash
npm start
```

### 4. Testing Search
Verifies the retrieval logic without running the full MCP server.
```bash
node dist/scripts/test-search.js "your search query here"
```

## MCP Tools

The server exposes the following tools to the AI agent:

- `search_docs(query, limit)`: Performs a semantic search and returns the top N unique parent documentation sections. **Always prefer this over manual grep/find.**
- `get_doc_by_id(id)`: Retrieves a specific documentation section by its unique ID.

## Development Conventions

- **ID Generation:** Parent IDs are MD5 hashes based on the repository name, source file path, section title, and index to ensure uniqueness and prevent collisions.
- **Data Directory:**
    - `data/raw/`: Original RST documentation repositories.
    - `data/processed/`: Intermediate JSON files.
    - `data/lancedb/`: The LanceDB vector database.
- **Model Choice:** `Xenova/bge-small-en-v1.5` is chosen for its balance of performance and efficiency for local execution.
