import fs from 'fs';

const html = fs.readFileSync('scratch/notion_raw_ssr.html', 'utf8');

// Find all script tags
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
let match;
let idx = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  const content = match[1];
  if (content.length > 5000) {
    console.log(`Script ${idx} length: ${content.length}`);
    fs.writeFileSync(`scratch/script_${idx}.js`, content);
  }
  idx++;
}

console.log('Done scanning scripts.');
