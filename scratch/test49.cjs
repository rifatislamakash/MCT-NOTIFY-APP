const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('id="screen-notices-list"');
console.log(html.substring(start, start + 800));
