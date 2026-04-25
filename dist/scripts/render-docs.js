import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAW_DIR = path.resolve(__dirname, '../../data/raw');
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;
const repos = readdirSync(RAW_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);
for (const repo of repos) {
    const repoPath = path.join(RAW_DIR, repo);
    console.log(`[${repo}] Rendering documentation...`);
    execSync(`docker run --user ${uid}:${gid} --rm --pull always -v "${repoPath}":/project ghcr.io/typo3-documentation/render-guides:latest --config=Documentation`, { stdio: 'inherit' });
    console.log(`[${repo}] Done.`);
}
