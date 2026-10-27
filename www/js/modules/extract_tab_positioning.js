const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for tab container and indicator positioning CSS
const patterns = [
  /position:\s*absolute[^;]{0,200}tab-indicator/g,
  /tab-indicator[^;]{0,200}position:\s*absolute/g,
  /x-tab[^;]{0,200}position[^;]{0,100}/gi,
  /tab[^;]{0,200}relative[^;]{0,100}/gi
];

patterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== Pattern ${i} ===`);
  console.log(matches.slice(0, 15).join('\n\n'));
  console.log();
});
