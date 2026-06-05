const fs = require('fs');
const content = fs.readFileSync('src/pages/SalesPage.jsx', 'utf8');
const lines = content.split('\n');
fs.writeFileSync('src/pages/SalesPage.jsx', lines.slice(0, 440).join('\n'), 'utf8');
console.log('Done, kept', Math.min(440, lines.length), 'lines, total was', lines.length);
