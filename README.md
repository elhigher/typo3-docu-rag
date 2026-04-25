# typo3-docu-rag

An MCP (Model Context Protocol) server that provides semantic search over TYPO3 v13.4 documentation. Ask Claude or any MCP-compatible AI agent questions about TYPO3 and get answers grounded in the official docs.

## How it works

Documentation is fetched from the official TYPO3 GitHub repositories, rendered locally to HTML using the same Docker-based toolchain TYPO3 uses for docs.typo3.org, parsed into sections, and indexed into a local vector database. The MCP server exposes semantic search over that index.

**Retrieval strategy — Small-to-Big:** queries are matched against small paragraph-level chunks for precision, then the full parent sections are returned to the agent for context.

**Covered documentation (TYPO3 v13.4):**
- [Core API Reference](https://docs.typo3.org/m/typoscript/reference-coreapi/13.4/en-us/)
- [TypoScript Reference](https://docs.typo3.org/m/typoscript/reference-typoscript/13.4/en-us/)
- [TCA Reference](https://docs.typo3.org/m/typo3/reference-tca/13.4/en-us/)
- [Fluid ViewHelper Reference](https://docs.typo3.org/m/typo3/reference-fluid/13.4/en-us/)

## Prerequisites

- Node.js 18+
- Docker (for rendering RST documentation to HTML)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build the ingestion pipeline

Run the following steps in order. Each step only needs to be re-run if the upstream documentation changes.

```bash
npm run fetch    # clone TYPO3 doc repos into data/raw/
npm run render   # render .rst → HTML via Docker (takes a few minutes)
npm run parse    # parse HTML → data/processed/all_docs.json
npm run index    # embed and index into LanceDB
```

### 3. Build the server

```bash
npm run build
```

## MCP Configuration

### Using npx

```json
{
  "mcpServers": {
    "typo3-docs": {
      "command": "npx",
      "args": ["-y", "typo3-docu-rag"]
    }
  }
}
```

On first start the server automatically builds the vector index from the bundled documentation (~1–2 min). The index is stored in `~/.typo3-docu-rag/lancedb/` and reused on subsequent starts.

### Using a local clone

```json
{
  "mcpServers": {
    "typo3-docs": {
      "command": "node",
      "args": ["/path/to/typo3-docu-rag/dist/index.js"]
    }
  }
}
```

Add this to your Claude Desktop config (`~/.claude/claude_desktop_config.json`) or use the Claude Code CLI:

```bash
claude mcp add typo3-docs -s user -- node /path/to/typo3-docu-rag/dist/index.js
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_docs(query, limit?, repo?)` | Semantic search returning full documentation sections. `repo` optionally filters to `CoreApi`, `Typoscript`, `TCA`, or `Fluid`. |
| `get_doc_by_id(id)` | Retrieve a specific documentation section by ID. |

## Tech stack

- **Vector DB:** [LanceDB](https://lancedb.com/) — local, serverless
- **Embeddings:** [Transformers.js](https://huggingface.co/docs/transformers.js) with `Xenova/bge-small-en-v1.5` — runs fully locally
- **Doc rendering:** [`ghcr.io/typo3-documentation/render-guides`](https://github.com/TYPO3-Documentation/render-guides) — official TYPO3 Docker image
- **Protocol:** [Model Context Protocol](https://modelcontextprotocol.io/)
- **Language:** TypeScript / Node.js ESM