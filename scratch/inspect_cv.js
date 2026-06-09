import fs from 'fs';
const data = JSON.parse(fs.readFileSync('scratch/notion_blocks.json', 'utf8'));
const recordMap = data.recordMap;
const collectionViewId = Object.keys(recordMap.collection_view)[0];
const cv = recordMap.collection_view[collectionViewId];

console.log('Keys of cv:', Object.keys(cv || {}));
if (cv.value) {
  console.log('Keys of cv.value:', Object.keys(cv.value));
  console.log('page_sort exists:', !!cv.value.page_sort);
  if (cv.value.page_sort) {
    console.log('page_sort length:', cv.value.page_sort.length);
  }
}
