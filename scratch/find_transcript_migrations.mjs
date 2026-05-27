import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\Sales5\\.gemini\\antigravity\\brain\\031d5167-7cac-4337-bb12-984f98574c6f\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("Searching transcript for migration activities...");
  let count = 0;
  for await (const line of rl) {
    if (line.includes("migrate_employees.mjs") || line.includes("Successfully migrated") || line.includes("Delete the old unprefixed employee document")) {
      count++;
      try {
        const obj = JSON.parse(line);
        console.log(`\nMatch #${count}:`);
        console.log(`  Step Index: ${obj.step_index}`);
        console.log(`  Source: ${obj.source}`);
        console.log(`  Type: ${obj.type}`);
        if (obj.content) {
          console.log(`  Content: ${obj.content.substring(0, 500)}...`);
        }
        if (obj.tool_calls) {
          console.log(`  Tool Calls: ${JSON.stringify(obj.tool_calls).substring(0, 500)}...`);
        }
      } catch (e) {
        console.log(`  Could not parse JSON line: ${line.substring(0, 200)}...`);
      }
    }
  }
  console.log(`\nSearch complete. Found ${count} matching lines.`);
  process.exit(0);
}

main().catch(console.error);
