import fs from 'fs';

const content = fs.readFileSync('src/store/TicketContext.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('toast') || line.includes('Notification') || line.includes('notify') || line.includes('sound') || line.includes('Audio')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
