import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/collection_query_resp.json', 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};

console.log('Total block keys:', Object.keys(blocks).length);

let pageCount = 0;
for (const blockId of Object.keys(blocks)) {
  const block = blocks[blockId].value;
  if (!block) continue;
  if (block.type === 'page') {
    pageCount++;
    if (pageCount <= 10) {
      console.log(`Page ID: ${blockId}`);
      console.log(`  parent_id: ${block.parent_id}`);
      console.log(`  parent_table: ${block.parent_table}`);
      console.log(`  properties:`, JSON.stringify(block.properties, null, 2));
    }
  }
}
console.log('Total pages found:', pageCount);
