const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for the full tab-indicator HTML template
const patterns = [
  /class=["']tab-indicator["'][^>]*>[\s\S]{0,200}/g,
  /tab-indicator["'][^>]*style=["'][^"']*["'][^>]*>[\s\S]{0,300}/g,
  /tab-indicator[\s\S]{0,500}?class=["'][^"']*["'][\s\S]{0,200}/g
];

patterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== Pattern ${i} ===`);
  console.log(matches.slice(0, 10).join('\n\n'));
  console.log();
});
