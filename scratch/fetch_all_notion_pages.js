import fs from 'fs';
import https from 'https';

const blocksData = JSON.parse(fs.readFileSync('scratch/notion_blocks.json', 'utf8'));
const recordMap = blocksData.recordMap;
const collectionViewId = Object.keys(recordMap.collection_view)[0];
const pageSort = recordMap.collection_view[collectionViewId].value.value.page_sort;

console.log(`Found ${pageSort.length} pages in database page_sort list.`);

const results = [];

function fetchPageChunk(pageId) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      pageId: pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false
    });

    const options = {
      hostname: 'www.notion.so',
      port: 443,
      path: '/api/v3/loadPageChunk',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to load page chunk for ${pageId}, status: ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => { reject(err); });
    req.write(requestBody);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse block texts from recordMap
function parsePageText(recordMap) {
  const blocks = recordMap.block || {};
  const pageTextBlocks = [];
  let title = 'Untitled';
  let section = '';
  let subsection = '';

  // Find the page block to get properties
  for (const blockId of Object.keys(blocks)) {
    const block = blocks[blockId].value && blocks[blockId].value.value;
    if (!block) continue;
    
    if (block.type === 'page') {
      if (block.properties) {
        if (block.properties.title) {
          title = block.properties.title.map(p => p[0]).join('');
        }
        // Section: "QYIs"
        if (block.properties.QYIs) {
          section = block.properties.QYIs.map(p => p[0]).join('');
        }
        // Subsection: "pkvJ"
        if (block.properties.pkvJ) {
          subsection = block.properties.pkvJ.map(p => p[0]).join('');
        }
      }
    }
  }

  // Extract all paragraph, bullet, header texts
  for (const blockId of Object.keys(blocks)) {
    const block = blocks[blockId].value && blocks[blockId].value.value;
    if (!block) continue;
    if (block.type === 'page') continue;

    if (block.properties && block.properties.title) {
      const text = block.properties.title.map(p => p[0]).join('');
      pageTextBlocks.push({
        type: block.type,
        text: text
      });
    }
  }

  return { title, section, subsection, blocks: pageTextBlocks };
}

async function main() {
  for (let i = 0; i < pageSort.length; i++) {
    const pageId = pageSort[i];
    console.log(`[${i + 1}/${pageSort.length}] Fetching page ${pageId}...`);
    try {
      const response = await fetchPageChunk(pageId);
      if (response && response.recordMap) {
        const parsedPage = parsePageText(response.recordMap);
        results.push({
          pageId,
          title: parsedPage.title,
          section: parsedPage.section,
          subsection: parsedPage.subsection,
          blocks: parsedPage.blocks
        });
        console.log(`  Title: "${parsedPage.title}" | Section: "${parsedPage.section}" | Blocks: ${parsedPage.blocks.length}`);
      }
    } catch (e) {
      console.error(`  ERROR fetching page ${pageId}:`, e.message);
    }
    await sleep(200);
  }

  fs.writeFileSync('scratch/notion_guidebook_full_api.json', JSON.stringify(results, null, 2));
  console.log('Saved 100% of Notion Guidebook content to scratch/notion_guidebook_full_api.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
});
