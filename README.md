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
- [Changelog](https://docs.typo3.org/c/typo3/cms-core/main/en-us/)

## Installation

Choose one of two installation modes — **npx** (zero-config, no clone needed) or **local clone** (for development or re-parsing the docs yourself).

---

### Option A — npx (recommended)

> Prerequisites: Node.js 18+

**Step 1 — build the vector index once** (~5–25 min depending on your setup):
```bash
npx -y github:elhigher/typo3-docu-rag setup
```

The index is stored in `~/.typo3-docu-rag/lancedb/` and reused on all subsequent starts.

**Step 2 — add to your coding agent**

Claude Code:
```bash
claude mcp add typo3-docs -s user -- npx -y github:elhigher/typo3-docu-rag
```

Or add manually to your agents `mcp.json`:
```json
{
  "mcpServers": {
    "typo3-docs": {
      "command": "npx",
      "args": ["-y", "github:elhigher/typo3-docu-rag"]
    }
  }
}
```

---

### Option B — local clone

> Prerequisites: Node.js 18+, Docker (only needed if re-rendering the docs)

**Step 1 — install dependencies and build:**
```bash
npm install
npm run build
```

**Step 2 — add to your coding agent**

Claude Code:
```bash
claude mcp add typo3-docs -s user -- node /path/to/typo3-docu-rag/dist/index.js
```

Or add manually to your agents `mcp.json`:
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

**Step 3 — build the vector index once** (~5–25 min depending on your setup):
```bash
npm run index
```

#### Re-indexing from source (optional)

Only needed if you want to re-fetch or re-render the upstream TYPO3 documentation. Run the pipeline steps in order — each step only needs to be re-run if the upstream docs change:

```bash
npm run fetch    # clone TYPO3 doc repos into data/raw/
npm run render   # render .rst → HTML via Docker (takes a few minutes)
npm run parse    # parse HTML → data/processed/all_docs.json
npm run index    # embed and index into LanceDB (~5-25 min)
```

All scripts run from `dist/` — `npm run build` must be done first.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_docs(query, limit?, repo?)` | Semantic search returning full documentation sections. `repo` optionally filters to `CoreApi`, `Typoscript`, `TCA`, `Fluid`, or `Changelog`. |
| `get_doc_by_id(id)` | Retrieve a specific documentation section by ID. |
| `get_best_practices(version)` | Returns curated extension development best practices for a TYPO3 major version (`"11"`, `"12"`, or `"13"`). Cascades across versions — requesting `"13"` returns v11 + v12 + v13 combined, with higher versions taking precedence on contradictions. Use this when starting or auditing a TYPO3 extension. |

## Tech stack

- **Vector DB:** [LanceDB](https://lancedb.com/) — local, serverless
- **Embeddings:** [Transformers.js](https://huggingface.co/docs/transformers.js) with `Xenova/bge-small-en-v1.5` — runs fully locally
- **Doc rendering:** [`ghcr.io/typo3-documentation/render-guides`](https://github.com/TYPO3-Documentation/render-guides) — official TYPO3 Docker image
- **Protocol:** [Model Context Protocol](https://modelcontextprotocol.io/)
- **Language:** TypeScript / Node.js ESM