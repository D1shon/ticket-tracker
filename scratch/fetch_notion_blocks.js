import fs from 'fs';
import https from 'https';

// UUID format of 346ff702d87b80a7ab03fa77c144ecf6: 346ff702-d87b-80a7-ab03-fa77c144ecf6
const requestBody = JSON.stringify({
  pageId: "346ff702-d87b-80a7-ab03-fa77c144ecf6",
  limit: 100,
  cursor: { stack: [] },
  chunkNumber: 0,
  verticalColumns: false
});

const options = {
  hostname: 'www.notion.so',
  port: 4443,
  path: '/api/v3/loadPageChunk',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Length': Buffer.byteLength(requestBody)
  }
};

// Try port 443
options.port = 443;

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('scratch/notion_blocks.json', data);
    console.log('Successfully wrote scratch/notion_blocks.json. Status:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('Keys in response:', Object.keys(parsed));
      if (parsed.recordMap) {
        console.log('RecordMap keys:', Object.keys(parsed.recordMap));
        console.log('Block count:', Object.keys(parsed.recordMap.block || {}).length);
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
  });
});

req.on('error', (err) => {
  console.error('Error fetching page chunk:', err);
});

req.write(requestBody);
req.end();
