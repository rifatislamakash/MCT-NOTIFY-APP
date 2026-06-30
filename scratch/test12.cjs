const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const idx = txt.indexOf('id="notification-toast"');
console.log(txt.substring(idx - 100, idx + 800));
