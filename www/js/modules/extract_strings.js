const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
const matches = content.match(/["'`][^"'`]{0,200}["'`]/g) || [];
const relevant = matches.filter(s => /header|avatar|直播|x-social|back-btn|class=/i.test(s));
console.log(relevant.slice(0, 50).join('\n'));
