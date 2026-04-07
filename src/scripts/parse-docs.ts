import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DATA_DIR = path.resolve(__dirname, '../../data/raw');
const PROCESSED_DATA_DIR = path.resolve(__dirname, '../../data/processed');

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

const REPO_URL_MAP: Record<string, string> = {
  'CoreApi': 'https://docs.typo3.org/m/typo3/reference-coreapi/13.4/en-us/',
  'Typoscript': 'https://docs.typo3.org/m/typo3/reference-typoscript/13.4/en-us/',
  'TCA': 'https://docs.typo3.org/m/typo3/reference-tca/13.4/en-us/'
};

async function parseDocs() {
  if (!fs.existsSync(PROCESSED_DATA_DIR)) {
    fs.mkdirSync(PROCESSED_DATA_DIR, { recursive: true });
  }

  const allProcessedDocs: ParentDoc[] = [];

  for (const repoName of Object.keys(REPO_URL_MAP)) {
    const repoPath = path.join(RAW_DATA_DIR, repoName);
    const docDir = path.join(repoPath, 'Documentation');

    if (!fs.existsSync(docDir)) {
      console.warn(`[${repoName}] No Documentation directory found at ${docDir}`);
      continue;
    }

    console.log(`[${repoName}] Parsing documentation files...`);
    const files = await glob('**/*.rst', { cwd: docDir, ignore: ['**/_includes/**', '**/_Resources/**'] });

    for (const file of files) {
      const filePath = path.join(docDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const parsedDocs = splitRstToSections(content, file, repoName);
      allProcessedDocs.push(...parsedDocs);
    }
  }

  const outputPath = path.join(PROCESSED_DATA_DIR, 'all_docs.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProcessedDocs, null, 2));
  console.log(`Successfully parsed ${allProcessedDocs.length} sections and saved to ${outputPath}`);
}

function generateId(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function splitRstToSections(content: string, filePath: string, repoName: string): ParentDoc[] {
  const lines = content.split('\n');
  const sections: ParentDoc[] = [];
  
  let currentSectionTitle = filePath.replace('.rst', '');
  let currentSectionContent: string[] = [];
  
  const baseUrl = REPO_URL_MAP[repoName];
  const fileUrl = baseUrl + filePath.replace('.rst', '.html');

  // Basic RST header detection (lines of symbols under a title)
  const headerSymbols = ['=', '-', '~', '*', '^', '"'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (nextLine && nextLine.length > 0 && nextLine.length >= line.length && 
        headerSymbols.includes(nextLine[0]) && nextLine.split('').every(char => char === nextLine[0])) {
      
      // Found a header! Finish current section if any.
      if (currentSectionContent.length > 0) {
        sections.push(createParentDoc(currentSectionTitle, currentSectionContent.join('\n'), filePath, fileUrl, repoName, sections.length));
      }
      
      currentSectionTitle = line.trim();
      currentSectionContent = [];
      i++; // Skip the header line (=== etc.)
      continue;
    }

    currentSectionContent.push(line);
  }

  // Last section
  if (currentSectionContent.length > 0) {
    sections.push(createParentDoc(currentSectionTitle, currentSectionContent.join('\n'), filePath, fileUrl, repoName, sections.length));
  }

  return sections;
}

function createParentDoc(title: string, content: string, source: string, url: string, repo: string, index: number): ParentDoc {
  const fullContent = `${title}\n${content}`;
  const parentId = generateId(`${repo}-${source}-${title}-${index}`);
  
  // Create child chunks (very basic sentence/paragraph splitting for now)
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
  const chunks: DocChunk[] = paragraphs.map((p, chunkIndex) => ({
    id: `${parentId}-chunk-${chunkIndex}`,
    text: p.trim()
  }));

  // If no chunks were created from paragraphs, just use the whole content as a chunk
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({ id: `${parentId}-chunk-0`, text: content.trim() });
  }

  return {
    id: parentId,
    source,
    title,
    content: fullContent,
    url,
    repo,
    chunks
  };
}

parseDocs().catch(console.error);
