import fs from 'fs';
import https from 'https';

const pageId = "346ff702-d87b-80bb-a5d5-c02b1d06c744";

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
          reject(new Error(`Failed to load page chunk ${chunkNumber}, status: ${res.statusCode}`));
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

async function getFullPageBlocks(pageId) {
  let chunkNumber = 0;
  let cursor = { stack: [] };
  const allBlocks = {};

  while (true) {
    console.log(`Fetching chunk ${chunkNumber}...`);
    const resp = await fetchPageChunk(pageId, chunkNumber, cursor);
    const blocks = resp.recordMap?.block || {};
    
    let addedAny = false;
    for (const id of Object.keys(blocks)) {
      if (!allBlocks[id]) {
        allBlocks[id] = blocks[id];
        addedAny = true;
      }
    }

    console.log(`Fetched chunk ${chunkNumber}. Blocks in this chunk: ${Object.keys(blocks).length}. Total unique blocks: ${Object.keys(allBlocks).length}`);

    // Update cursor
    if (resp.cursor && resp.cursor.stack && resp.cursor.stack.length > 0) {
      cursor = resp.cursor;
      chunkNumber++;
    } else {
      console.log('No more chunks (cursor.stack is empty).');
      break;
    }

    if (!addedAny) {
      console.log('No new blocks added, breaking to avoid loop.');
      break;
    }

    // Wait 200ms
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return allBlocks;
}

async function main() {
  const allBlocks = await getFullPageBlocks(pageId);
  const rootBlock = allBlocks[pageId]?.value?.value;
  if (!rootBlock) {
    console.log('Root block not found');
    return;
  }

  const list = [];
  if (rootBlock.content) {
    rootBlock.content.forEach((childId) => {
      const childBlock = allBlocks[childId]?.value?.value;
      if (childBlock && childBlock.properties && childBlock.properties.title) {
        const text = childBlock.properties.title.map(p => p[0]).join('');
        list.push({
          type: childBlock.type,
          text: text
        });
      }
    });
  }

  console.log(`Reconstructed page content. Total blocks in ordered content: ${list.length}`);
  fs.writeFileSync('scratch/reconstructed_page.json', JSON.stringify(list, null, 2));
  console.log('Saved to scratch/reconstructed_page.json');
}

main().catch(console.error);
