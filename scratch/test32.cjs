const fs = require('fs');
const txt = fs.readFileSync('js/dashboard.js', 'utf8');
const start = txt.indexOf('container.addEventListener(\'scroll\', () => {');
console.log(txt.substring(start, start + 1000));
