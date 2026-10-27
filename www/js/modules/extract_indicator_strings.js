const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for tab-indicator in encoded strings
const matches = content.match(/["'`][^"'`]{0,300}tab-indicator[^"'`]{0,300}["'`]/g) || [];
console.log('=== Tab Indicator Strings ===');
console.log(matches.slice(0, 20).join('\n\n'));
