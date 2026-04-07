import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as lancedb from '@lancedb/lancedb';
import { pipeline } from '@xenova/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROCESSED_DATA_DIR = path.resolve(__dirname, '../../data/processed');
const DB_DIR = path.resolve(__dirname, '../../data/lancedb');
const ALL_DOCS_PATH = path.join(PROCESSED_DATA_DIR, 'all_docs.json');

// Using a high-quality, lightweight embedding model
const MODEL_NAME = 'Xenova/bge-small-en-v1.5';

interface DocChunk {
  id: string;
  text: string;
}

interface ParentDoc {
  id: string;
  source: string;
  title: string;
  content: string;
  url: string;
  repo: string;
  chunks: DocChunk[];
}

async function indexDocs() {
  if (!fs.existsSync(ALL_DOCS_PATH)) {
    throw new Error(`Processed docs not found at ${ALL_DOCS_PATH}. Run parse-docs first.`);
  }

  const allDocs: ParentDoc[] = JSON.parse(fs.readFileSync(ALL_DOCS_PATH, 'utf-8'));
  console.log(`Loaded ${allDocs.length} parent documents.`);

  const db = await lancedb.connect(DB_DIR);

  // Initialize Embedding Pipeline
  console.log(`Loading embedding model: ${MODEL_NAME}...`);
  const embedder = await pipeline('feature-extraction', MODEL_NAME);

  // 1. Setup Parents Table
  console.log("Setting up 'parents' table...");
  const parentsTable = await db.createTable('parents', allDocs.map(doc => ({
    id: doc.id,
    source: doc.source,
    title: doc.title,
    content: doc.content,
    url: doc.url,
    repo: doc.repo
  })), { mode: 'overwrite' });

  // 2. Setup Chunks Table (with Vectors)
  console.log("Setting up 'chunks' table and generating embeddings...");
  
  const chunkRecords: any[] = [];
  const BATCH_SIZE = 100;
  let processedCount = 0;

  for (const doc of allDocs) {
    for (const chunk of doc.chunks) {
      chunkRecords.push({
        id: chunk.id,
        parent_id: doc.id,
        text: chunk.text,
        source: doc.source,
        repo: doc.repo,
        url: doc.url
      });
    }
  }

  console.log(`Total chunks to index: ${chunkRecords.length}`);

  // Create table with empty data initially or first batch to define schema
  const finalChunks: any[] = [];
  
  for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
    const batch = chunkRecords.slice(i, i + BATCH_SIZE);
    
    // Generate embeddings for the batch
    const batchTexts = batch.map(r => r.text);
    const output = await embedder(batchTexts, { pooling: 'mean', normalize: true });
    const embeddings = output.tolist();

    for (let j = 0; j < batch.length; j++) {
      finalChunks.push({
        ...batch[j],
        vector: embeddings[j]
      });
    }

    processedCount += batch.length;
    if (processedCount % 500 === 0 || processedCount === chunkRecords.length) {
      console.log(`Indexed ${processedCount}/${chunkRecords.length} chunks...`);
    }
  }

  console.log("Creating 'chunks' table in LanceDB...");
  await db.createTable('chunks', finalChunks, { mode: 'overwrite' });

  console.log("Indexing complete!");
}

indexDocs().catch(console.error);
