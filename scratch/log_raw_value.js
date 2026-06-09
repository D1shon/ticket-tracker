import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/collection_query_resp.json', 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};
const firstKey = Object.keys(blocks)[0];

if (firstKey) {
  console.log(`Key: ${firstKey}`);
  console.log(`Value:`, JSON.stringify(blocks[firstKey], null, 2));
}
