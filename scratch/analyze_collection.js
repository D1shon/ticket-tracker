import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/notion_blocks.json', 'utf8'));
const recordMap = data.recordMap;

console.log('Collection keys:', Object.keys(recordMap.collection || {}));
console.log('Collection view keys:', Object.keys(recordMap.collection_view || {}));

// Print details
const collectionId = Object.keys(recordMap.collection || {})[0];
const collectionViewId = Object.keys(recordMap.collection_view || {})[0];

console.log(`Collection ID: ${collectionId}`);
console.log(`Collection View ID: ${collectionViewId}`);

if (collectionId) {
  console.log('Collection value:', JSON.stringify(recordMap.collection[collectionId].value, null, 2));
}
if (collectionViewId) {
  console.log('Collection view value:', JSON.stringify(recordMap.collection_view[collectionViewId].value, null, 2));
}
