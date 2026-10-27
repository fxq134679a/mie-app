const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for CSS patterns related to tabs and indicators
const cssPatterns = [
  /\.x-tab[^{]*\{[^}]{0,300}\}/g,
  /\.tab-indicator[^{]*\{[^}]{0,300}\}/g,
  /tab[^{]*background[^}]{0,200}/gi,
  /indicator[^{]*width[^}]{0,200}/gi
];

cssPatterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== CSS Pattern ${i} ===`);
  console.log(matches.slice(0, 10).join('\n\n'));
  console.log();
});
