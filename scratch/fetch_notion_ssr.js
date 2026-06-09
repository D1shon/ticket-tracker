import fs from 'fs';
import https from 'https';

const url = 'https://www.notion.so/346ff702d87b80a7ab03fa77c144ecf6?v=346ff702d87b80dbaf42000cd8969906';

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('scratch/notion_raw_ssr.html', data);
    console.log('Successfully wrote scratch/notion_raw_ssr.html. Length:', data.length);
    
    // Look for script tags
    const matchNextData = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (matchNextData) {
      fs.writeFileSync('scratch/next_data.json', matchNextData[1]);
      console.log('Found __NEXT_DATA__! Length:', matchNextData[1].length);
    } else {
      console.log('__NEXT_DATA__ not found.');
    }
  });
}).on('error', (err) => {
  console.error('Error fetching Notion page:', err);
});
