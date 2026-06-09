import fs from 'fs';

const content = fs.readFileSync('scratch/script_27.js', 'utf8');

// The file might contain multiple calls to __notion_html_async.push
// We can define a mock __notion_html_async object and eval the code, or regex parse it.
const argsList = [];
const __notion_html_async = {
  push: (...args) => {
    argsList.push(args);
  }
};

try {
  eval(content);
  console.log(`Successfully eval-ed script_27.js. Found ${argsList.length} pushes.`);
  argsList.forEach((args, idx) => {
    console.log(`[Push ${idx + 1}] Key: "${args[0]}"`);
    if (args[1]) {
      const keys = Object.keys(args[1]);
      console.log(`  Keys in payload:`, keys);
      if (args[0] === 'recordMap') {
        const blocks = args[1].block || {};
        console.log(`  Blocks count:`, Object.keys(blocks).length);
        const blockKeys = Object.keys(blocks);
        if (blockKeys.length > 0) {
          console.log(`  First 5 block keys:`, blockKeys.slice(0, 5));
          const firstBlock = blocks[blockKeys[0]].value || {};
          console.log(`  First block type:`, firstBlock.type);
        }
      }
    }
  });
} catch (e) {
  console.error("Eval failed:", e);
}
