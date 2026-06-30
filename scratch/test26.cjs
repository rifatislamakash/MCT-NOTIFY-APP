const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const nIdx = txt.indexOf('id="screen-notices-list"');
console.log(txt.substring(nIdx - 500, nIdx + 100));
