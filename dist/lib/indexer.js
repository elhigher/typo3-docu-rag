import * as fs from 'fs';
import * as lancedb from '@lancedb/lancedb';
const BATCH_SIZE = 100;
export async function buildIndex(docsPath, dbDir, embedder) {
    const allDocs = JSON.parse(fs.readFileSync(docsPath, 'utf-8'));
    console.error(`Loaded ${allDocs.length} parent documents.`);
    fs.mkdirSync(dbDir, { recursive: true });
    const db = await lancedb.connect(dbDir);
    console.error("Setting up 'parents' table...");
    await db.createTable('parents', allDocs.map(doc => ({
        id: doc.id,
        source: doc.source,
        title: doc.title,
        content: doc.content,
        url: doc.url,
        repo: doc.repo
    })), { mode: 'overwrite' });
    const chunkRecords = allDocs.flatMap(doc => doc.chunks.map(chunk => ({
        id: chunk.id,
        parent_id: doc.id,
        text: chunk.text,
        source: doc.source,
        repo: doc.repo,
        url: doc.url
    })));
    console.error(`Generating embeddings for ${chunkRecords.length} chunks...`);
    const finalChunks = [];
    for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
        const batch = chunkRecords.slice(i, i + BATCH_SIZE);
        const output = await embedder(batch.map(r => r.text), { pooling: 'mean', normalize: true });
        const embeddings = output.tolist();
        for (let j = 0; j < batch.length; j++) {
            finalChunks.push({ ...batch[j], vector: embeddings[j] });
        }
        const done = Math.min(i + BATCH_SIZE, chunkRecords.length);
        if (done % 500 < BATCH_SIZE || done === chunkRecords.length) {
            console.error(`Indexed ${done}/${chunkRecords.length} chunks...`);
        }
    }
    await db.createTable('chunks', finalChunks, { mode: 'overwrite' });
    console.error('Indexing complete.');
}
