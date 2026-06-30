const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const shellIdx = txt.indexOf('id="app-viewport-shell"');
console.log(txt.substring(shellIdx - 500, shellIdx + 500));
