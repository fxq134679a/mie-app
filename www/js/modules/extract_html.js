const fs = require('fs');
const content = fs.readFileSync('D:/A/html/miemie/js/modules/pp.js', 'utf8');
// Search for HTML template patterns
const htmlPatterns = content.match(/<div[^>]*class=["'][^"']*x-top-bar[^"']*["'][^>]*>[\s\S]{0,2000}/g) || [];
console.log('=== X Top Bar ===');
console.log(htmlPatterns.slice(0, 5).join('\n\n'));
