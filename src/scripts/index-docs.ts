import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { pipeline } from '@xenova/transformers';
import { buildIndex } from '../lib/indexer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_PATH = path.resolve(__dirname, '../../data/processed/all_docs.json');
const DB_DIR = process.env.TYPO3_RAG_DATA_DIR
  ? path.join(path.resolve(process.env.TYPO3_RAG_DATA_DIR), 'lancedb')
  : path.join(os.homedir(), '.typo3-docu-rag', 'lancedb');

const MODEL_NAME = 'Xenova/bge-small-en-v1.5';

async function indexDocs() {
  console.log(`Writing database to: ${DB_DIR}`);
  const embedder = await pipeline('feature-extraction', MODEL_NAME);
  await buildIndex(DOCS_PATH, DB_DIR, embedder);
}

indexDocs().catch(console.error);