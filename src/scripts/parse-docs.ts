import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTML_DATA_DIR = path.resolve(__dirname, '../../data/html');
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
  'CoreApi': 'https://docs.typo3.org/m/typoscript/reference-coreapi/13.4/en-us/',
  'Typoscript': 'https://docs.typo3.org/m/typoscript/reference-typoscript/13.4/en-us/',
  'TCA': 'https://docs.typo3.org/m/typo3/reference-tca/13.4/en-us/',
  'Fluid': 'https://docs.typo3.org/m/typo3/reference-fluid/13.4/en-us/'
};

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Use GFM plugin for tables, task lists, etc.
turndownService.use(gfm);

// Custom rule for HTML Definition Lists (<dl>, <dt>, <dd>)
turndownService.addRule('definition-list', {
  filter: 'dl',
  replacement: function (content, node) {
    const $ = cheerio.load((node as any).outerHTML || '');
    let result = '';
    
    // Process only direct children of the current DL
    $('dl').first().children().each((_, el) => {
      const $el = $(el);
      if ($el.is('dt')) {
        // Use turndown for the term itself
        const termMd = turndownService.turndown($el.html() || '').trim();
        result += `${termMd}\n`;
      } else if ($el.is('dd')) {
        // Use turndown for the description content to handle nested lists/tags
        let descriptionMd = turndownService.turndown($el.html() || '').trim();
        
        const lines = descriptionMd.split('\n');
        result += `: ${lines[0]}\n`;
        if (lines.length > 1) {
          result += lines.slice(1).map(line => `    ${line}`).join('\n') + '\n';
        }

        // Add a blank line if the next element is a new term (dt)
        if ($el.next().is('dt')) {
          result += '\n';
        }
      }
    });
    return `\n${result.trim()}\n`;
  }
});

async function parseDocs() {
  if (!fs.existsSync(PROCESSED_DATA_DIR)) {
    fs.mkdirSync(PROCESSED_DATA_DIR, { recursive: true });
  }

  const tempJsonlPath = path.join(PROCESSED_DATA_DIR, 'temp_docs.jsonl');
  if (fs.existsSync(tempJsonlPath)) {
    fs.unlinkSync(tempJsonlPath);
  }

  let totalParsedSections = 0;

  for (const repoName of Object.keys(REPO_URL_MAP)) {
    const repoPath = path.join(HTML_DATA_DIR, repoName);

    if (!fs.existsSync(repoPath)) {
      console.warn(`[${repoName}] Directory not found at ${repoPath}`);
      continue;
    }

    console.log(`[${repoName}] Parsing HTML documentation files...`);
    const files = await glob('**/*.html', { cwd: repoPath, ignore: ['**/_includes/**', '**/_Resources/**'] });

    for (const file of files) {
      const filePath = path.join(repoPath, file);
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        const parsedDocs = parseHtmlToSections(content, file, repoName);
        
        for (const doc of parsedDocs) {
          fs.appendFileSync(tempJsonlPath, JSON.stringify(doc) + '\n');
          totalParsedSections++;
        }

        content = '';
      } catch (err) {
        console.error(`[${repoName}] Error processing ${file}:`, err);
      }
    }
  }

  if (totalParsedSections === 0) {
    console.warn('No documentation sections were parsed.');
    return;
  }

  const outputPath = path.join(PROCESSED_DATA_DIR, 'all_docs.json');
  const outputStream = fs.createWriteStream(outputPath);
  outputStream.write('[\n');

  const fileStream = fs.createReadStream(tempJsonlPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isFirst = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!isFirst) {
      outputStream.write(',\n');
    }
    outputStream.write(line);
    isFirst = false;
  }

  outputStream.write('\n]');
  outputStream.end();

  if (fs.existsSync(tempJsonlPath)) {
    fs.unlinkSync(tempJsonlPath);
  }
  console.log(`Successfully parsed ${totalParsedSections} sections and saved to ${outputPath}`);
}

function generateId(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function parseHtmlToSections(htmlContent: string, filePath: string, repoName: string): ParentDoc[] {
  const $ = cheerio.load(htmlContent);

  // Clean up "noise" before parsing
  $('div.confval-back-to-top').remove();

  const sections: ParentDoc[] = [];
  
  const article = $('article.document').first();
  if (article.length === 0) {
    return [];
  }

  const baseUrl = REPO_URL_MAP[repoName];
  const fileUrl = baseUrl + filePath.replace('.html', '.html');

  let currentSectionTitle = path.basename(filePath, '.html');
  let currentSectionHtml: string[] = [];

  article.children().each((_, element) => {
    const el = $(element);
    const tagName = el.prop('tagName')?.toLowerCase() || '';

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      if (currentSectionHtml.length > 0) {
        const contentMd = turndownService.turndown(currentSectionHtml.join(''));
        sections.push(createParentDoc(currentSectionTitle, contentMd, filePath, fileUrl, repoName, sections.length));
      }
      currentSectionTitle = el.text().trim() || currentSectionTitle;
      currentSectionHtml = [$.html(el)];
    } else {
      const outerHtml = $.html(el);
      if (outerHtml && outerHtml.trim()) {
        currentSectionHtml.push(outerHtml);
      }
    }
  });

  // Finalize the last section
  if (currentSectionHtml.length > 0) {
    const contentMd = turndownService.turndown(currentSectionHtml.join(''));
    sections.push(createParentDoc(currentSectionTitle, contentMd, filePath, fileUrl, repoName, sections.length));
  }

  return sections;
}

function createParentDoc(title: string, content: string, source: string, url: string, repo: string, index: number): ParentDoc {
  const fullContent = `${title}\n${content}`;
  const parentId = generateId(`${repo}-${source}-${title}-${index}`);
  
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
  const chunks: DocChunk[] = paragraphs.map((p, chunkIndex) => ({
    id: `${parentId}-chunk-${chunkIndex}`,
    text: p.trim()
  }));

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
