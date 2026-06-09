import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/collection_query_resp.json', 'utf8'));
const recordMap = data.recordMap || {};
const blocks = recordMap.block || {};

const pages = [];

for (const blockId of Object.keys(blocks)) {
  const blockOuter = blocks[blockId];
  if (!blockOuter) continue;
  
  // Double unwrapping for Notion API response
  let block = blockOuter.value;
  if (block && block.value) {
    block = block.value;
  }
  
  if (!block) continue;
  
  if (block.type === 'page') {
    const props = block.properties || {};
    
    // Helper to get text from property
    const getPropText = (propVal) => {
      if (!propVal) return '';
      return propVal.map(p => p[0]).join('');
    };

    const title = getPropText(props.title);
    const section = getPropText(props.QYIs);
    const subsection = getPropText(props.pkvJ);
    const description = getPropText(props['kS{@']);
    const status = getPropText(props['[dbZ']);
    const extraText = getPropText(props['{I?F']);

    pages.push({
      id: blockId,
      title,
      section,
      subsection,
      description,
      status,
      extraText,
      propertiesKeys: Object.keys(props)
    });
  }
}

console.log(`Parsed ${pages.length} pages from collection query:`);
pages.forEach((p, idx) => {
  console.log(`[${idx + 1}] Title: "${p.title}"`);
  console.log(`    Section: "${p.section}" | Subsection: "${p.subsection}"`);
  console.log(`    Description (first 80 chars): "${p.description.substring(0, 80)}..."`);
  console.log(`    ExtraText (first 80 chars): "${p.extraText.substring(0, 80)}..."`);
});

fs.writeFileSync('scratch/parsed_notion_pages.json', JSON.stringify(pages, null, 2));
