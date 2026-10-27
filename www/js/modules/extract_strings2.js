const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
const matches = content.match(/["'`][^"'`]{0,500}["'`]/g) || [];
const relevant = matches.filter(s => /trending-header|back-btn|class=|header|avatar|直播/i.test(s));
console.log(relevant.slice(0, 100).join('\n'));
