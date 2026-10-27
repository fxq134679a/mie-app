const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for tab-indicator CSS patterns
const patterns = [
  /\.tab-indicator[\s\S]{0,500}?}/g,
  /tab-indicator[^;]{0,300};/g,
  /indicator[^;]{0,300}width[^;]{0,100};/gi,
  /indicator[^;]{0,300}background[^;]{0,100};/gi
];

patterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== Pattern ${i} ===`);
  console.log(matches.slice(0, 15).join('\n\n'));
  console.log();
});
