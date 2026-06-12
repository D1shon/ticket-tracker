import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/reconstructed_page.json', 'utf8'));

const target = "При обращении клиента";
const index = data.findIndex(b => b.text && b.text.includes(target));

if (index === -1) {
  console.log('Target not found in reconstructed page.');
} else {
  console.log(`Found target at index ${index}. Next blocks:`);
  console.log(JSON.stringify(data.slice(index, index + 30), null, 2));
}
