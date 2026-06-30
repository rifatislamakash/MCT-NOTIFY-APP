const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const before = txt.substring(0, 24434);
const parts = before.split('id="screen-');
console.log('screen-' + parts[parts.length-1].substring(0, 50).split('"')[0]);
