import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'notion_raw_ssr.html');
if (!fs.existsSync(filePath)) {
  console.log('notion_raw_ssr.html does not exist');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const searchStr = 'При обращении';
const index = content.indexOf(searchStr);

if (index === -1) {
  console.log('Not found in notion_raw_ssr.html');
} else {
  console.log('Found! Surrounding context:');
  console.log(content.substring(Math.max(0, index - 500), Math.min(content.length, index + 1500)));
}
