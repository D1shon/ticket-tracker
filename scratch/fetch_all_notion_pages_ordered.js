import fs from 'fs';
import https from 'https';

const blocksData = JSON.parse(fs.readFileSync('scratch/notion_blocks.json', 'utf8'));
const recordMap = blocksData.recordMap;
const collectionViewId = Object.keys(recordMap.collection_view)[0];
const pageSort = recordMap.collection_view[collectionViewId].value.value.page_sort;

console.log(`Found ${pageSort.length} pages in database page_sort list.`);

function fetchPageChunk(pageId, chunkNumber = 0, cursor = { stack: [] }) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      pageId: pageId,
      limit: 100,
      cursor: cursor,
      chunkNumber: chunkNumber,
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
          reject(new Error(`Failed to load page chunk ${chunkNumber} for page ${pageId}, status: ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
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

async function getFullPageBlocks(pageId) {
  let chunkNumber = 0;
  let cursor = { stack: [] };
  const allBlocks = {};

  while (true) {
    const resp = await fetchPageChunk(pageId, chunkNumber, cursor);
    const blocks = resp.recordMap?.block || {};
    
    let addedAny = false;
    for (const id of Object.keys(blocks)) {
      if (!allBlocks[id]) {
        allBlocks[id] = blocks[id];
        addedAny = true;
      }
    }

    if (resp.cursor && resp.cursor.stack && resp.cursor.stack.length > 0) {
      cursor = resp.cursor;
      chunkNumber++;
    } else {
      break;
    }

    if (!addedAny) {
      break;
    }

    await sleep(150);
  }

  return allBlocks;
}

function parsePageTextOrdered(pageId, allBlocks) {
  const rootBlock = allBlocks[pageId]?.value?.value;
  if (!rootBlock) {
    return { title: 'Untitled', section: '', subsection: '', blocks: [] };
  }

  let title = 'Untitled';
  let section = '';
  let subsection = '';

  if (rootBlock.properties) {
    if (rootBlock.properties.title) {
      title = rootBlock.properties.title.map(p => p[0]).join('');
    }
    // Section property: "QYIs"
    if (rootBlock.properties.QYIs) {
      section = rootBlock.properties.QYIs.map(p => p[0]).join('');
    }
    // Subsection property: "pkvJ"
    if (rootBlock.properties.pkvJ) {
      subsection = rootBlock.properties.pkvJ.map(p => p[0]).join('');
    }
  }

  const pageTextBlocks = [];
  if (rootBlock.content) {
    rootBlock.content.forEach((childId) => {
      const childBlock = allBlocks[childId]?.value?.value;
      if (!childBlock) return;
      
      if (childBlock.properties && childBlock.properties.title) {
        const text = childBlock.properties.title.map(p => p[0]).join('');
        pageTextBlocks.push({
          type: childBlock.type,
          text: text
        });
      }
    });
  }

  return { title, section, subsection, blocks: pageTextBlocks };
}

async function main() {
  const results = [];

  for (let i = 0; i < pageSort.length; i++) {
    const pageId = pageSort[i];
    console.log(`[${i + 1}/${pageSort.length}] Fetching page ${pageId}...`);
    try {
      const allBlocks = await getFullPageBlocks(pageId);
      const parsedPage = parsePageTextOrdered(pageId, allBlocks);
      results.push({
        pageId,
        title: parsedPage.title,
        section: parsedPage.section,
        subsection: parsedPage.subsection,
        blocks: parsedPage.blocks
      });
      console.log(`  Title: "${parsedPage.title.trim()}" | Section: "${parsedPage.section}" | Blocks: ${parsedPage.blocks.length}`);
    } catch (e) {
      console.error(`  ERROR fetching page ${pageId}:`, e.message);
    }
    await sleep(200);
  }

  fs.writeFileSync('scratch/notion_guidebook_full_api.json', JSON.stringify(results, null, 2));
  console.log('Saved 100% of ordered and complete Notion Guidebook content to scratch/notion_guidebook_full_api.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
});
