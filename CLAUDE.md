# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # compile TypeScript → dist/ (required before other scripts)
npm run fetch        # clone/pull TYPO3 doc repos into data/raw/
npm run render       # render .rst → HTML via Docker (requires Docker)
npm run parse        # parse rendered HTML → data/processed/all_docs.json
npm run index        # embed chunks and build LanceDB tables (~1-5 min)
npm start            # run the MCP server (requires indexed data)
```

All pipeline scripts run from `dist/` — run `npm run build` first.

One-time index build for end users (no clone required):
```bash
node dist/index.js setup   # or: npx -y github:elhigher/typo3-docu-rag setup
```

This is the `setup` subcommand in `src/index.ts` — it reads the bundled `data/processed/all_docs.json` and writes the LanceDB index to `~/.typo3-docu-rag/lancedb/`. The server itself (`npm start`) fails fast if the index is missing rather than building it on startup.

Test search without starting the full server:
```bash
node dist/scripts/test-search.js "your query here"
```

## Architecture

This is a RAG (Retrieval-Augmented Generation) system exposed as an MCP server. It answers questions about TYPO3 v13.4 documentation via semantic vector search.

### Data pipeline (one-time setup, run in order)

1. **`fetch-docs.ts`** — clones 5 TYPO3 doc repos (branch `13.4`) into `data/raw/` using `simple-git`. Pulls on re-run.
2. **`render-docs.ts`** — runs `ghcr.io/typo3-documentation/render-guides:latest` (Docker) for each repo in `data/raw/`. Output lands in `data/raw/<repo>/Documentation-GENERATED-temp/`.
3. **`parse-docs.ts`** — reads HTML from `Documentation-GENERATED-temp/`, splits by heading tags into sections, converts to Markdown via Turndown (with GFM + custom definition-list rules), chunks by paragraph, and writes `data/processed/all_docs.json`.
4. **`index-docs.ts`** — reads `all_docs.json`, embeds each chunk with `Xenova/bge-small-en-v1.5` (local), and writes two LanceDB tables: `parents` (full sections) and `chunks` (embeddings).

### MCP server (`src/index.ts`)

Exposes two tools over stdio transport:
- **`search_docs(query, limit?, repo?)`** — Small-to-Big retrieval: vector-searches the `chunks` table, then resolves matched chunks back to their `parents` for full-context responses. `repo` filters to `CoreApi`, `Typoscript`, `TCA`, `Fluid`, or `Changelog`.
- **`get_doc_by_id(id)`** — direct parent document lookup by MD5 hash ID.

### ID scheme

Parent IDs are MD5 hashes of `${repo}-${sourceFile}-${sectionTitle}-${index}`. Chunk IDs are `${parentId}-chunk-${n}`. IDs are deterministic — re-parsing the same content always produces the same IDs.

### Key data directories

| Path | Contents |
|------|----------|
| `data/raw/` | Cloned git repos (RST source) |
| `data/raw/<repo>/Documentation-GENERATED-temp/` | Rendered HTML (Docker output) |
| `data/processed/all_docs.json` | Parsed sections with chunks (~32 MB) — shipped with npm package |
| `~/.typo3-docu-rag/lancedb/` | LanceDB vector database (default, stable across npx runs) |

Set `TYPO3_RAG_DATA_DIR` to override the database location (e.g. `TYPO3_RAG_DATA_DIR=./data` to use the legacy project-local path).

### Module system

TypeScript is compiled with `module: NodeNext`. All imports must use `.js` extensions even for `.ts` source files. The MCP server entry point (`dist/index.js`) is chmod +x'd by the build script for use as a CLI binary.