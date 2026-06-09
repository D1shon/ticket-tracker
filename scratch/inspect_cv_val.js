import fs from 'fs';
const data = JSON.parse(fs.readFileSync('scratch/notion_blocks.json', 'utf8'));
const recordMap = data.recordMap;
const collectionViewId = Object.keys(recordMap.collection_view)[0];
const cv = recordMap.collection_view[collectionViewId];

if (cv.value && cv.value.value) {
  console.log('Keys of cv.value.value:', Object.keys(cv.value.value));
  console.log('page_sort inside cv.value.value:', !!cv.value.value.page_sort);
  if (cv.value.value.page_sort) {
    console.log('page_sort length:', cv.value.value.page_sort.length);
    console.log('page_sort values:', cv.value.value.page_sort);
  }
}
