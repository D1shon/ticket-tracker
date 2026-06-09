import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/collection_query_resp.json', 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};

for (const blockId of Object.keys(blocks)) {
  const blockOuter = blocks[blockId];
  if (!blockOuter) continue;
  
  let block = blockOuter.value;
  if (block && block.value) {
    block = block.value;
  }
  
  if (block && block.type === 'page' && block.properties) {
    console.log('Page:', block.properties.title ? block.properties.title[0][0] : 'Untitled');
    console.log('Properties keys:', Object.keys(block.properties));
    for (const key of Object.keys(block.properties)) {
      console.log(`  Key "${key}":`, JSON.stringify(block.properties[key]));
    }
    break; // Just print the first one
  }
}
