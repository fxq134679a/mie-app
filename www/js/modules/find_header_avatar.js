const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for avatar in header/top bar context
const patterns = [
  /header[^}]{0,300}avatar[^}]{0,200}/gi,
  /top-bar[^}]{0,300}avatar[^}]{0,200}/gi,
  /profile[^}]{0,300}avatar[^}]{0,200}/gi,
  /x-profile-header[^}]{0,300}/gi
];

patterns.forEach((pattern, i) => {
  const matches = content.match(pattern) || [];
  console.log(`=== Pattern ${i} ===`);
  console.log(matches.slice(0, 10).join('\n\n'));
  console.log();
});
