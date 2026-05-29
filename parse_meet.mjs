import fs from 'fs';
const html = fs.readFileSync('C:\\Users\\Sales5\\.gemini\\antigravity\\brain\\10dfc053-e8e8-48fe-97bf-c6cb789f1731\\.system_generated\\steps\\295\\content.md', 'utf8');

// Find all matches for times like 16:00, 18:00, etc.
const timeMatches = html.match(/\b\d{1,2}:\d{2}\b/g);
console.log('Time matches:', timeMatches);

// Find any ISO date-times
const isoMatches = html.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g);
console.log('ISO matches:', isoMatches);

// Find any numbers
const numbers = html.match(/\b\d+\b/g);
console.log('All numbers in HTML:', numbers);
