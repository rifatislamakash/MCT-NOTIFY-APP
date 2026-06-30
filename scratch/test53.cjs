const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const start = txt.indexOf('id="notices-list-container"');
console.log(txt.substring(start - 200, start + 300));
