#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import * as lancedb from "@lancedb/lancedb";
import { pipeline } from "@xenova/transformers";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import * as fs from "fs";
import { buildIndex } from "./lib/indexer.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.TYPO3_RAG_DATA_DIR
    ? path.resolve(process.env.TYPO3_RAG_DATA_DIR)
    : path.join(os.homedir(), '.typo3-docu-rag');
const DB_DIR = path.join(DATA_DIR, 'lancedb');
const BUNDLED_DOCS = path.resolve(__dirname, '../data/processed/all_docs.json');
const BEST_PRACTICES_DIR = path.resolve(__dirname, '../data/best-practices');
const MODEL_NAME = 'Xenova/bge-small-en-v1.5';
const BEST_PRACTICES_VERSION_ORDER = ['11', '12', '13'];
const BEST_PRACTICES_VERSIONS = {
    '11': path.join(BEST_PRACTICES_DIR, 'v11.md'),
    '12': path.join(BEST_PRACTICES_DIR, 'v12.md'),
    '13': path.join(BEST_PRACTICES_DIR, 'v13.md'),
};
// Global instances
let db;
let embedder;
/**
 * Initialize Database and Embedding Model
 */
async function initialize() {
    if (!fs.existsSync(DB_DIR)) {
        throw new Error(`Index not found at ${DB_DIR}.\n` +
            `Run setup first: npx github:elhigher/typo3-docu-rag setup`);
    }
    embedder = await pipeline('feature-extraction', MODEL_NAME);
    console.error(`Loaded embedding model: ${MODEL_NAME}.`);
    db = await lancedb.connect(DB_DIR);
    console.error('Connected to LanceDB.');
}
async function runSetup() {
    if (fs.existsSync(DB_DIR)) {
        console.log(`Index already exists at ${DB_DIR}`);
        console.log('To rebuild, delete that directory and run setup again.');
        return;
    }
    if (!fs.existsSync(BUNDLED_DOCS)) {
        throw new Error(`Bundled docs not found at ${BUNDLED_DOCS}.`);
    }
    console.log('Loading embedding model (downloads ~30 MB on first run)...');
    const setupEmbedder = await pipeline('feature-extraction', MODEL_NAME);
    console.log('Building vector index (~1-5 min depending on hardware)...');
    await buildIndex(BUNDLED_DOCS, DB_DIR, setupEmbedder);
    console.log(`\nSetup complete! Index stored at ${DB_DIR}`);
    console.log('Add the MCP server to Claude Code:');
    console.log('  claude mcp add typo3-docs -s user -- npx -y github:elhigher/typo3-docu-rag');
}
/**
 * Small-to-Big Retrieval Implementation
 */
async function searchDocs(query, limit = 5, repo) {
    const chunksTable = await db.openTable("chunks");
    const parentsTable = await db.openTable("parents");
    // 1. Embed the query
    const output = await embedder(query, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
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
    const parentDocs = [];
    for (const parentId of uniqueParentIds) {
        const docs = await parentsTable.query().where(`id = '${parentId}'`).toArray();
        if (docs && docs.length > 0) {
            parentDocs.push(docs[0]);
        }
    }
    return parentDocs;
}
const server = new Server({
    name: "typo3-rag-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
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
                            description: "Optional repository filter. Use 'CoreApi', 'Typoscript', 'TCA', 'Fluid' or 'Changelog'.",
                            enum: ["CoreApi", "Typoscript", "TCA", "Fluid", "Changelog"]
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
            },
            {
                name: "get_best_practices",
                description: "Get curated TYPO3 extension development best practices for a specific major version. Returns best practices for all versions up to and including the requested one in cascade (e.g. v13 returns v11+v12+v13). Higher versions supersede lower ones on contradictions. Call this when starting, reviewing, or auditing a TYPO3 extension. Available versions: 11, 12, 13.",
                inputSchema: {
                    type: "object",
                    properties: {
                        version: {
                            type: "string",
                            description: "TYPO3 major version. One of: '11', '12', '13'.",
                            enum: ["11", "12", "13"]
                        }
                    },
                    required: ["version"]
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
            const { query, limit, repo } = args;
            const results = await searchDocs(query, limit, repo);
            return {
                content: results.map(doc => ({
                    type: "text",
                    text: `Title: ${doc.title}\nURL: ${doc.url}\n\nContent:\n${doc.content}\n---`
                }))
            };
        }
        if (name === "get_doc_by_id") {
            const { id } = args;
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
        if (name === "get_best_practices") {
            const { version } = args;
            if (!BEST_PRACTICES_VERSIONS[version]) {
                return {
                    content: [{ type: "text", text: `No best practices file found for TYPO3 v${version}. Available versions: ${BEST_PRACTICES_VERSION_ORDER.join(', ')}.` }],
                    isError: true
                };
            }
            const versionsToInclude = BEST_PRACTICES_VERSION_ORDER.slice(0, BEST_PRACTICES_VERSION_ORDER.indexOf(version) + 1);
            const sections = versionsToInclude.map((v) => {
                const filePath = BEST_PRACTICES_VERSIONS[v];
                if (!fs.existsSync(filePath))
                    return null;
                return fs.readFileSync(filePath, 'utf-8');
            }).filter(Boolean);
            const combined = sections.length === 1
                ? sections[0]
                : `> Best practices are shown in version order (v${versionsToInclude[0]}→v${version}). Where versions contradict, the **higher version takes precedence**.\n\n` +
                    sections.map((s, i) => `---\n\n<!-- v${versionsToInclude[i]} -->\n\n${s}`).join('\n\n');
            return {
                content: [{ type: "text", text: combined }]
            };
        }
        throw new Error(`Tool not found: ${name}`);
    }
    catch (error) {
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
if (process.argv[2] === 'setup') {
    runSetup().catch((error) => { console.error(error.message); process.exit(1); });
}
else {
    runServer().catch((error) => { console.error("Fatal error running server:", error); process.exit(1); });
}
