const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for HTML template patterns with different approaches
const patterns = [
  /class=["'][^"']*trending-header[^"']*["'][^>]*>[\s\S]{0,1000}/g,
  /id=["'][^"']*top-bar-avatar[^"']*["'][^>]*>[\s\S]{0,500}/g,
  /class=["'][^"']*x-top-bar[^"']*["'][^>]*>[\s\S]{0,1000}/g
];

patterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== Pattern ${i} ===`);
  console.log(matches.slice(0, 3).join('\n\n'));
  console.log();
});
