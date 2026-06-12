import fs from 'fs';
import path from 'path';

const filePath = 'scratch/single_page_resp.json';
if (!fs.existsSync(filePath)) {
  console.log('single_page_resp.json does not exist');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};

// Find page block
const pageId = "346ff702-d87b-80bb-a5d5-c02b1d06c744";
const pageBlock = blocks[pageId]?.value?.value;

if (!pageBlock) {
  console.log('Page block not found in single_page_resp.json');
  process.exit(1);
}

console.log('Page Title:', pageBlock.properties?.title?.[0]?.[0]);
console.log('Page Content child block IDs count:', pageBlock.content?.length || 0);

if (pageBlock.content) {
  pageBlock.content.forEach((childId, index) => {
    const childBlock = blocks[childId]?.value?.value;
    if (childBlock) {
      const titleText = childBlock.properties?.title?.map(p => p[0]).join('') || '';
      console.log(`[${index}] Block ${childId} | Type: ${childBlock.type} | Text: "${titleText.substring(0, 60)}"`);
    } else {
      console.log(`[${index}] Block ${childId} | MISSING from recordMap.block`);
    }
  });
}
