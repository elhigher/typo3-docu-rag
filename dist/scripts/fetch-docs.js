import { simpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPOS = [
    {
        url: 'https://github.com/TYPO3-Documentation/TYPO3CMS-Reference-CoreApi.git',
        branch: '13.4',
        name: 'CoreApi'
    },
    {
        url: 'https://github.com/TYPO3-Documentation/TYPO3CMS-Reference-Typoscript.git',
        branch: '13.4',
        name: 'Typoscript'
    },
    {
        url: 'https://github.com/TYPO3-Documentation/TYPO3CMS-Reference-TCA.git',
        branch: '13.4',
        name: 'TCA'
    },
    {
        url: 'https://github.com/TYPO3-Documentation/TYPO3CMS-Reference-ViewHelper.git',
        branch: '13.4',
        name: 'Fluid'
    }
];
const RAW_DATA_DIR = path.resolve(__dirname, '../../data/raw');
async function fetchDocs() {
    if (!fs.existsSync(RAW_DATA_DIR)) {
        fs.mkdirSync(RAW_DATA_DIR, { recursive: true });
    }
    const git = simpleGit({ config: ['credential.helper='] });
    for (const repo of REPOS) {
        const targetPath = path.join(RAW_DATA_DIR, repo.name);
        if (fs.existsSync(targetPath)) {
            console.log(`[${repo.name}] Pulling latest...`);
            try {
                await simpleGit(targetPath, { config: ['credential.helper='] }).pull();
                console.log(`[${repo.name}] Up to date.`);
            }
            catch (error) {
                console.error(`[${repo.name}] Pull error:`, error);
            }
            continue;
        }
        console.log(`[${repo.name}] Cloning branch ${repo.branch}...`);
        try {
            await git.clone(repo.url, targetPath, [
                '--branch', repo.branch,
                '--depth', '1',
                '--single-branch'
            ]);
            console.log(`[${repo.name}] Success.`);
        }
        catch (error) {
            console.error(`[${repo.name}] Error:`, error);
        }
    }
}
fetchDocs().catch(console.error);
