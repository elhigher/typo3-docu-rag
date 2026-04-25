#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as lancedb from "@lancedb/lancedb";
import { pipeline } from "@xenova/transformers";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, "../data/lancedb");
const MODEL_NAME = 'Xenova/bge-small-en-v1.5';

// Global instances
let db: lancedb.Connection;
let embedder: any;

/**
 * Initialize Database and Embedding Model
 */
async function initialize() {
  if (!fs.existsSync(DB_DIR)) {
    throw new Error(`Database not found at ${DB_DIR}. Run indexing first.`);
  }
  
  db = await lancedb.connect(DB_DIR);
  console.error("Connected to LanceDB.");
  
  embedder = await pipeline('feature-extraction', MODEL_NAME);
  console.error(`Loaded embedding model: ${MODEL_NAME}.`);
}

/**
 * Small-to-Big Retrieval Implementation
 */
async function searchDocs(query: string, limit: number = 5, repo?: string) {
  const chunksTable = await db.openTable("chunks");
  const parentsTable = await db.openTable("parents");

  // 1. Embed the query
  const output = await embedder(query, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data) as number[];

  // 2. Search "Small" (Chunks)
  let searchBuilder = chunksTable
    .vectorSearch(vector)
    .limit(limit * 3); // Fetch more chunks to ensure we get unique parents

  if (repo) {
    searchBuilder = searchBuilder.where(`repo = '${repo}'`);
  }

  const results = await searchBuilder.toArray();

  // 3. Resolve to "Big" (Parents)
  const uniqueParentIds = Array.from(new Set(results.map(r => r.parent_id))).slice(0, limit);
  
  const parentDocs: any[] = [];
  for (const parentId of uniqueParentIds) {
    const docs = await parentsTable.query().where(`id = '${parentId}'`).toArray();
    if (docs && docs.length > 0) {
      parentDocs.push(docs[0]);
    }
  }

  return parentDocs;
}

const server = new Server(
  {
    name: "typo3-rag-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Tool Listing
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_docs",
        description: "CRITICAL: Use this tool for ALL TYPO3 v13.4 documentation queries. This RAG system uses semantic vector search and Small-to-Big retrieval, which is significantly more accurate than manual grep or find. Do NOT search the local 'data/' directory manually; use this tool instead.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query (e.g., 'How to register a middleware?')"
            },
            limit: {
              type: "number",
              description: "Maximum number of sections to return (default: 5)",
              default: 5
            },
            repo: {
              type: "string",
              description: "Optional repository filter. Use 'CoreApi', 'Typoscript', or 'TCA'.",
              enum: ["CoreApi", "Typoscript", "TCA"]
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_doc_by_id",
        description: "Retrieve a specific TYPO3 documentation section by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The parent document ID"
            }
          },
          required: ["id"]
        }
      }
    ],
  };
});

/**
 * Tool Execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name === "search_docs") {
      const { query, limit, repo } = args as { query: string, limit?: number, repo?: string };
      const results = await searchDocs(query, limit, repo);
      
      return {
        content: results.map(doc => ({
          type: "text",
          text: `Title: ${doc.title}\nURL: ${doc.url}\n\nContent:\n${doc.content}\n---`
        }))
      };
    }

    if (name === "get_doc_by_id") {
      const { id } = args as { id: string };
      const parentsTable = await db.openTable("parents");
      const docs = await parentsTable.query().where(`id = '${id}'`).toArray();
      
      if (!docs || docs.length === 0) {
        return {
          content: [{ type: "text", text: `Document with ID ${id} not found.` }],
          isError: true
        };
      }

      return {
        content: [{
          type: "text",
          text: `Title: ${docs[0].title}\nURL: ${docs[0].url}\n\nContent:\n${docs[0].content}`
        }]
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

/**
 * Start Server
 */
async function runServer() {
  await initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TYPO3 RAG MCP Server started.");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
