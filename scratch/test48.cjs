const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const start = html.indexOf('id="screen-notices-list"');
console.log("screen-notices-list opening tag:");
console.log(html.substring(start - 50, start + 100));
