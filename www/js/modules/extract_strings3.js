const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
const matches = content.match(/["'`][^"'`]{0,1000}["'`]/g) || [];
const relevant = matches.filter(s => /x-top-bar|trending-header|back-btn|直播|class=["'][^"']*header/i.test(s));
console.log(relevant.slice(0, 50).join('\n'));
