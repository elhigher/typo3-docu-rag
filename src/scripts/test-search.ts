import * as lancedb from "@lancedb/lancedb";
import { pipeline } from "@xenova/transformers";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, "../../data/lancedb");
const MODEL_NAME = 'Xenova/bge-small-en-v1.5';

async function testSearch(query: string) {
  console.log(`Searching for: "${query}"`);
  
  const db = await lancedb.connect(DB_DIR);
  const embedder = await pipeline('feature-extraction', MODEL_NAME);

  const chunksTable = await db.openTable("chunks");
  const parentsTable = await db.openTable("parents");

  const output = await embedder(query, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data) as number[];

  const results = await chunksTable
    .vectorSearch(vector)
    .limit(10)
    .toArray();

  console.log(`Found ${results.length} chunks.`);
  
  const uniqueParentIds = Array.from(new Set(results.map(r => r.parent_id))).slice(0, 3);
  console.log(`Unique parents: ${uniqueParentIds.length}`);

  for (const parentId of uniqueParentIds) {
    const docs = await parentsTable.query().where(`id = '${parentId}'`).toArray();
    if (docs && docs.length > 0) {
      console.log(`\n--- Result ---`);
      console.log(`Title: ${docs[0].title}`);
      console.log(`URL: ${docs[0].url}`);
      console.log(`Content Preview: ${docs[0].content.substring(0, 200)}...`);
    }
  }
}

const query = process.argv[2] || "How to register a middleware?";
testSearch(query).catch(console.error);
