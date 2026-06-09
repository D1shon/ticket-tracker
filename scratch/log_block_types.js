import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/collection_query_resp.json', 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};

for (const blockId of Object.keys(blocks)) {
  const block = blocks[blockId].value;
  if (block) {
    console.log(`Block ID: ${blockId} | Type: ${block.type} | Alive: ${block.alive}`);
    if (block.properties) {
      console.log('  Properties:', Object.keys(block.properties));
    }
  }
}
