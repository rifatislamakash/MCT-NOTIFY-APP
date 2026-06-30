const fs = require('fs');
const txt = fs.readFileSync('js/dashboard.js', 'utf8');
const start = txt.indexOf('id="tag-scroll-container"');
console.log(txt.substring(start - 100, start + 300));
