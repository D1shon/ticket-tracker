import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/collection_query_resp.json', 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};

for (const blockId of Object.keys(blocks)) {
  const blockOuter = blocks[blockId];
  if (!blockOuter) continue;
  let block = blockOuter.value;
  if (block && block.value) block = block.value;
  if (!block) continue;
  
  if (block.type === 'page' && block.properties) {
    const title = block.properties.title ? block.properties.title[0][0] : 'Untitled';
    console.log(`=== Page: "${title}" ===`);
    for (const [key, val] of Object.entries(block.properties)) {
      if (key !== 'title') {
        console.log(`  Key "${key}":`, JSON.stringify(val));
      }
    }
  }
}
