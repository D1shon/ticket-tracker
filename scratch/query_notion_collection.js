import fs from 'fs';
import https from 'https';

const requestBody = JSON.stringify({
  collection: {
    id: "346ff702-d87b-8049-bf91-000b6ceccfef",
    spaceId: "b8ea35f2-a0b2-4cba-82ee-a1441479becd"
  },
  collectionView: {
    id: "346ff702-d87b-80db-af42-000cd8969906",
    spaceId: "b8ea35f2-a0b2-4cba-82ee-a1441479becd"
  },
  loader: {
    type: "reducer",
    reducers: {
      "collection_group_results": {
        "type": "results",
        "limit": 100
      }
    },
    searchQuery: "",
    userTimeZone: "Asia/Almaty"
  }
});

const options = {
  hostname: 'www.notion.so',
  port: 443,
  path: '/api/v3/queryCollection',
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
    fs.writeFileSync('scratch/collection_query_resp.json', data);
    console.log('Status code:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('Keys:', Object.keys(parsed));
      if (parsed.recordMap) {
        console.log('RecordMap keys:', Object.keys(parsed.recordMap));
        console.log('Block count:', Object.keys(parsed.recordMap.block || {}).length);
        const blockId = Object.keys(parsed.recordMap.block || {})[0];
        if (blockId) {
          console.log('Block sample keys:', Object.keys(parsed.recordMap.block[blockId] || {}));
          console.log('Block sample value:', JSON.stringify(parsed.recordMap.block[blockId].value, null, 2));
        }
      }
    } catch (e) {
      console.log('Parse failed:', e.message);
    }
  });
});

req.write(requestBody);
req.end();
