const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/layout/CallOverlay.jsx');

// Read as latin1 (handles any byte sequence without throwing)
const raw = fs.readFileSync(filePath, 'latin1');

// Find last occurrence of "export default CallOverlay;" and trim everything after
const marker = 'export default CallOverlay;';
const idx = raw.lastIndexOf(marker);

if (idx === -1) {
  console.error('Marker not found in file!');
  process.exit(1);
}

const trimmed = raw.slice(0, idx + marker.length) + '\n';

// Write back as UTF-8 (the valid ASCII/latin1 content remains valid UTF-8)
fs.writeFileSync(filePath, trimmed, 'utf8');
console.log('Fixed! New size:', trimmed.length, 'bytes (was:', raw.length, ')');
