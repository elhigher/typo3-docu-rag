import * as path from 'path';
import * as fs from 'fs';
import {fileURLToPath} from 'url';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});

// Use GFM plugin for tables, task lists, etc.
turndownService.use(gfm);

turndownService.addRule('definitionList', {
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

// Use keep for DL to prevent Turndown from processing its children (dt/dd) 
// after our replacement rule has already handled them.
// Note: We might not even need this if the rule is working correctly.
// turndownService.keep((node) => {
//   return node.nodeName === 'DL';
// });

function parseHtmlToSectionsTest(htmlContent: string, filePath: string): any[] {
  const $ = cheerio.load(htmlContent);

  // Clean up "noise" before parsing
  $('div.confval-back-to-top').remove();

  const sections: any[] = [];

  const article = $('article.document').first();
  if (article.length === 0) return [];
    let currentSectionTitle = path.basename(filePath, '.html');
    let currentSectionHtml: string[] = [];

    article.children().each((_, element) => {
        const el = $(element);
        const tagName = el.prop('tagName')?.toLowerCase() || '';

        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            if (currentSectionHtml.length > 0) {
                const contentMd = turndownService.turndown(currentSectionHtml.join(''));
                sections.push({title: currentSectionTitle, content: contentMd});
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

    if (currentSectionHtml.length > 0) {
        const contentMd = turndownService.turndown(currentSectionHtml.join(''));
        sections.push({title: currentSectionTitle, content: contentMd});
    }

    return sections;
}

async function runTest() {
    const testFilePath = path.resolve(__dirname, 'test-input.html');
    const testHtmlContent = `
    <article class="document">
      <h1>Test Heading</h1>
      <p>Regular paragraph.</p>
      
      <h2>Table Test</h2>
      <div class="table-responsive confval-table">
    <table class="table table-hover caption-top">        <thead>
        <tr>
            <th scope="col">Name</th>
            
                                    <th scope="col">Type</th>
                            
                                    <th scope="col">Scope</th>
                                    </tr>
        </thead>
                        <tbody><tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-appearance">appearance</a></div></td>
                    <td>
                            array
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                                        <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-collapseall">collapse<wbr>All</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-expandsingle">expand<wbr>Single</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-shownewrecordlink">show<wbr>New<wbr>Record<wbr>Link</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-newrecordlinkaddtitle">new<wbr>Record<wbr>Link<wbr>Add<wbr>Title</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                            
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-newrecordlinktitle">new<wbr>Record<wbr>Link<wbr>Title</a></div></td>
                    <td>
                            plain text label or <a href="https://docs.typo3.org/permalink/t3coreapi:label-reference">label reference</a>
                        </td>
                    <td>
                        </td>
            </tr>
                                        
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-createnewrelationlinktitle">create<wbr>New<wbr>Relation<wbr>Link<wbr>Title</a></div></td>
                    <td>
                            plain text label or <a href="https://docs.typo3.org/permalink/t3coreapi:label-reference">label reference</a>
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-levellinksposition">level<wbr>Links<wbr>Position</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-usecombination">use<wbr>Combination</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-suppresscombinationwarning">suppress<wbr>Combination<wbr>Warning</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                                        
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-usesortable">use<wbr>Sortable</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-showpossiblelocalizationrecords">show<wbr>Possible<wbr>Localization<wbr>Records</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-showalllocalizationlink">show<wbr>All<wbr>Localization<wbr>Link</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-showsynchronizationlink">show<wbr>Synchronization<wbr>Link</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-enabledcontrols">enabled<wbr>Controls</a></div></td>
                    <td>
                            array
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-showpossiblerecordsselector">show<wbr>Possible<wbr>Records<wbr>Selector</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-appearance-elementbrowserenabled">element<wbr>Browser<wbr>Enabled</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                        </td>
            </tr>
                
            
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-autosizemax">auto<wbr>Size<wbr>Max</a></div></td>
                    <td>
                            integer
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                                        
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-behaviour">behaviour</a></div></td>
                    <td>
                            
                        </td>
                    <td>
                        </td>
            </tr>
                                        <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-behaviour-allowlanguagesynchronization">allow<wbr>Language<wbr>Synchronization</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                                    Proc.
                                </td>
            </tr>
                            
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-behaviour-disablemovingchildrenwithparent">disable<wbr>Moving<wbr>Children<wbr>With<wbr>Parent</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                                    Proc.
                                </td>
            </tr>
                            
                                    <tr>
        <td><div class="confval-label ps-2"><a href="#confval-inline-behaviour-enablecascadingdelete">enable<wbr>Cascading<wbr>Delete</a></div></td>
                    <td>
                            boolean
                        </td>
                    <td>
                                    Proc.
                                </td>
            </tr>
                
            
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-customcontrols">custom<wbr>Controls</a></div></td>
                    <td>
                            array
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                                                    
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-filter">filter</a></div></td>
                    <td>
                            array
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                                        
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-default-sortby">foreign_<wbr>default_<wbr>sortby</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-field">foreign_<wbr>field</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-label">foreign_<wbr>label</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-match-fields">foreign_<wbr>match_<wbr>fields</a></div></td>
                    <td>
                            array
                        </td>
                    <td>
                                    Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-selector">foreign_<wbr>selector</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                            
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-sortby">foreign_<wbr>sortby</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display / Proc.
                                </td>
            </tr>
                                                                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-properties-foreign-table">foreign_<wbr>table</a></div></td>
                    <td>
                            string (table name)
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-table-field">foreign_<wbr>table_<wbr>field</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-foreign-unique">foreign_<wbr>unique</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-maxitems">maxitems</a></div></td>
                    <td>
                            integer &gt; 0
                        </td>
                    <td>
                                    Display / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-minitems">minitems</a></div></td>
                    <td>
                            integer &gt; 0
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-mm">MM</a></div></td>
                    <td>
                            string (table name)
                        </td>
                    <td>
                                    Proc.
                                </td>
            </tr>
                                        
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-mm-opposite-field">MM_<wbr>opposite_<wbr>field</a></div></td>
                    <td>
                            string (field name)
                        </td>
                    <td>
                                    Proc.
                                </td>
            </tr>
                                        
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-mm-hasuidfield">MM_<wbr>has<wbr>Uid<wbr>Field</a></div></td>
                    <td>
                            
                        </td>
                    <td>
                        </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-overridechildtca">override<wbr>Child<wbr>Tca</a></div></td>
                    <td>
                            array
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                            
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-size">size</a></div></td>
                    <td>
                            integer
                        </td>
                    <td>
                                    Display
                                </td>
            </tr>
                            
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-symmetric-field">symmetric_<wbr>field</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-symmetric-label">symmetric_<wbr>label</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
                        <tr>
        <td><div class="confval-label ps-0"><a href="#confval-inline-symmetric-sortby">symmetric_<wbr>sortby</a></div></td>
                    <td>
                            string
                        </td>
                    <td>
                                    Display  / Proc.
                                </td>
            </tr>
                
            </tbody></table>
</div>

      <h2>Definition List Test</h2>
     <dl class="confval">
        <dt class="d-flex justify-content-between">
            <div class="confval-header flex-grow-1">
                <code class="sig-name descname"><span class="pre">collapse<wbr>All</span></code>
                                    <a class="headerlink" href="#confval-inline-appearance-collapseall" data-bs-toggle="modal" data-bs-target="#linkReferenceModal" data-id="confval-inline-appearance-collapseall" title="Reference this configuration value"><i class="fa-solid fa-paragraph"></i></a>
                </div>
            <div class="confval-back-to-top">                    <a href="#confval-menu-inline" class="backToList" title="Back to list"><i class="fa-solid fa-angles-up fa-xs"></i></a>
                            </div>        </dt>
        <dd>
                            <dl class="field-list simple">
                                            <dt class="field-even">Type</dt>
                        <dd class="field-even">boolean
                        </dd>
                                                <dt class="field-even">Path</dt>
                            <dd class="field-even">$GLOBALS['TCA'][$table]['columns'][$field]['config']['appearance']['collapseAll']
                            </dd>
                                                    <dt class="field-even">Scope</dt>
                            <dd class="field-even">Display
                            </dd>
                        </dl>
                        <div class="confval-description">
                
    <p>Show all child records collapsed (if false, all are expanded)</p>

            </div>
        </dd>
    </dl>
      <h3>Another Section</h3>
      <p>End of test.</p>
    </article>
  `;

    fs.writeFileSync(testFilePath, testHtmlContent);

    try {
        console.log('--- Starting Test Parse ---');
        const results = parseHtmlToSectionsTest(testHtmlContent, 'test-input.html');

        results.forEach((section, index) => {
            console.log(`\n[Section ${index + 1}: ${section.title}]`);
            console.log('--- Markdown Content ---');
            console.log(section.content);
            console.log('------------------------');
        });

        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTest();
