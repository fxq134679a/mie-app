const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for tab-related HTML patterns
const patterns = [
  /class=["'][^"']*x-tab[^"']*["'][^>]*>[\s\S]{0,500}/g,
  /class=["'][^"']*tab-indicator[^"']*["'][^>]*>[\s\S]{0,300}/g,
  /为你推荐[\s\S]{0,300}正在关注/g,
  /正在关注[\s\S]{0,300}为你推荐/g
];

patterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== Pattern ${i} ===`);
  console.log(matches.slice(0, 5).join('\n\n'));
  console.log();
});
