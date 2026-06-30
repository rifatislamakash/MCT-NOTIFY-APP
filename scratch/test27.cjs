const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const start = txt.indexOf('id="screen-notices-list"');
console.log(txt.substring(start, start + 1500));
