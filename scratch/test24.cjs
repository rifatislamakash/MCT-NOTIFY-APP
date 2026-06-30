const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const idx = txt.indexOf('id="screen-notices-list"');
console.log(txt.substring(idx - 10, idx + 1000));
