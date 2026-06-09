import fs from 'fs';

const js = fs.readFileSync('scratch/script_27.js', 'utf8');

const searchTerms = ['Возрастные', 'ограничения', 'обувь', 'жвачка', 'билет'];
searchTerms.forEach(term => {
  const index = js.indexOf(term);
  console.log(`Term "${term}": ${index !== -1 ? 'FOUND at ' + index : 'NOT FOUND'}`);
  if (index !== -1) {
    // print some context
    console.log(`Context: ${js.substring(Math.max(0, index - 200), Math.min(js.length, index + 200))}`);
  }
});
