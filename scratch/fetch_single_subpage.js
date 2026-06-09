import fs from 'fs';
import https from 'https';

const pageId = "346ff702-d87b-80bb-a5d5-c02b1d06c744";
const requestBody = JSON.stringify({
  pageId: pageId,
  limit: 100,
  cursor: { stack: [] },
  chunkNumber: 0,
  verticalColumns: false
});

const options = {
  hostname: 'www.notion.so',
  port: 443,
  path: '/api/v3/loadPageChunk',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Length': Buffer.byteLength(requestBody)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('scratch/single_page_resp.json', data);
    console.log('Status code:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('Keys:', Object.keys(parsed));
      if (parsed.recordMap) {
        console.log('RecordMap keys:', Object.keys(parsed.recordMap));
        console.log('Blocks keys in recordMap:', Object.keys(parsed.recordMap.block || {}));
        const blockId = Object.keys(parsed.recordMap.block || {})[0];
        if (blockId) {
          console.log('Block sample value:', JSON.stringify(parsed.recordMap.block[blockId], null, 2));
        }
      }
    } catch (e) {
      console.log('Parse failed:', e.message);
    }
  });
});

req.write(requestBody);
req.end();
