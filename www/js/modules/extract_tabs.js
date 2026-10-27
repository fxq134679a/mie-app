const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
const matches = content.match(/["'`][^"'`]{0,500}["'`]/g) || [];
const relevant = matches.filter(s => /为你推荐|正在关注|tab|indicator|active|blue|下划线|nav-item|tab-item/i.test(s));
console.log(relevant.slice(0, 80).join('\n'));
